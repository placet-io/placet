import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AgentsService } from '../agents/agents.service';
import { assertPublicHost, assertSafeUrl } from './ssrf-guard';

export type ManagementHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Thin HTTP client that forwards a single request to an agent's configured
 * management API (`/api/v1/*`). The client is provider-agnostic: any agent
 * runtime that exposes a compatible bearer-authenticated REST surface works.
 * Handles auth, timeout, SSRF guard, and upstream error propagation.
 * Controllers call into this primitive; there is no wildcard proxy.
 */
@Injectable()
export class ManagementClient {
  private readonly logger = new Logger(ManagementClient.name);
  private static readonly TIMEOUT_MS = 15_000;
  /** Default cap on upstream response body before we give up. */
  private static readonly DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
  /** Default cap on outbound request body (controllers may override). */
  private static readonly DEFAULT_MAX_REQUEST_BYTES = 256 * 1024;

  constructor(private readonly agents: AgentsService) {}

  async request<T = unknown>(params: {
    agentId: string;
    ownerId: string;
    method: ManagementHttpMethod;
    path: string;
    query?: Record<string, string | string[] | undefined>;
    body?: unknown;
    /** Optional override for request body size cap. */
    maxRequestBytes?: number;
    /** Optional override for response body size cap. */
    maxResponseBytes?: number;
    responseType?: 'json' | 'text';
  }): Promise<T> {
    const creds = await this.agents.getManagementCredentials(
      params.agentId,
      params.ownerId,
    );
    if (!creds) {
      throw new NotFoundException(
        'Agent has no management credentials configured',
      );
    }

    const baseUrl = assertSafeUrl(creds.url);
    await assertPublicHost(baseUrl.hostname);

    const base = creds.url.endsWith('/') ? creds.url : creds.url + '/';
    const url = new URL(`api/v1/${params.path}`, base);
    if (params.query) {
      for (const [key, value] of Object.entries(params.query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, String(v));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    }

    const init: RequestInit = {
      method: params.method,
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        Accept:
          params.responseType === 'text'
            ? 'text/plain, text/markdown, text/x-diff, */*'
            : 'application/json',
      },
      // Never auto-follow: a 302 to http://169.254.169.254/... would carry the
      // bearer token. Controllers surface 3xx as upstream errors instead.
      redirect: 'manual',
    };
    if (params.body !== undefined && params.method !== 'GET') {
      const payload = JSON.stringify(params.body);
      const cap =
        params.maxRequestBytes ?? ManagementClient.DEFAULT_MAX_REQUEST_BYTES;
      if (Buffer.byteLength(payload, 'utf8') > cap) {
        throw new PayloadTooLargeException(
          `Management request body exceeds ${cap} bytes`,
        );
      }
      (init.headers as Record<string, string>)['Content-Type'] =
        'application/json';
      init.body = payload;
    }

    let upstream: Response;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ManagementClient.TIMEOUT_MS);
      try {
        upstream = await fetch(url, { ...init, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.logger.warn(
        `Management API unreachable for agent ${params.agentId}: ${(err as Error).message}`,
      );
      throw new BadGatewayException('Agent management API is not reachable');
    }

    // redirect: 'manual' surfaces 3xx as an opaque response; reject them.
    if (upstream.status >= 300 && upstream.status < 400) {
      throw new BadGatewayException(
        'Agent management API attempted a redirect (not allowed)',
      );
    }

    const maxBytes =
      params.maxResponseBytes ?? ManagementClient.DEFAULT_MAX_RESPONSE_BYTES;
    const contentLength = upstream.headers.get('content-length');
    if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
      throw new BadGatewayException(
        `Agent management response exceeds ${maxBytes} bytes`,
      );
    }

    const text = await readCappedText(upstream, maxBytes);
    const parsed = text ? safeJson(text) : null;

    if (!upstream.ok) {
      const message = extractUpstreamMessage(parsed, text, upstream.statusText);
      this.logger.warn(
        `Management API ${params.method} ${params.path} on agent ${params.agentId} -> ${upstream.status}: ${text.slice(0, 512)}`,
      );
      throw new HttpException(
        {
          error: {
            code: `upstream_${upstream.status}`,
            message,
          },
          upstreamStatus: upstream.status,
        },
        upstream.status,
      );
    }

    if (params.responseType === 'text') {
      return text as T;
    }

    return (parsed as T) ?? (undefined as unknown as T);
  }
}

/**
 * Read `response.text()` but stream with a byte counter so a misbehaving
 * upstream cannot exhaust memory.
 */
async function readCappedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new BadGatewayException(
        `Agent management response exceeds ${maxBytes} bytes`,
      );
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/** Extract a human-readable message from the upstream body without leaking internals. */
function extractUpstreamMessage(
  parsed: unknown,
  raw: string,
  fallback: string,
): string {
  if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;
    const err = p.error;
    if (err && typeof err === 'object') {
      const m = (err as Record<string, unknown>).message;
      if (typeof m === 'string' && m.length > 0) return m;
    }
    if (typeof p.message === 'string' && p.message.length > 0) return p.message;
    if (typeof p.detail === 'string' && p.detail.length > 0) return p.detail;
  }
  if (raw && raw.length <= 200) return raw;
  return fallback || 'Agent management API returned an error';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
