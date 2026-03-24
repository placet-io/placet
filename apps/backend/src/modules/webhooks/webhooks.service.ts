import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { LogsService } from '../logs/logs.service';

export interface WebhookCallback {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  auth?: {
    type: 'basic' | 'bearer';
    username?: string;
    password?: string;
    token?: string;
  };
}

const ALLOWED_PROTOCOLS = ['https:', 'http:'];
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '169.254.169.254', // AWS metadata
  'metadata.google.internal',
];

export interface WebhookLogContext {
  userId: string;
  apiKeyId?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Optional() @Inject(LogsService) private readonly logsService?: LogsService,
  ) {}
  private validateUrl(raw: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException(`Invalid webhook URL: ${raw}`);
    }

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new BadRequestException(
        `Webhook URL must use http or https (got ${parsed.protocol})`,
      );
    }

    if (BLOCKED_HOSTS.includes(parsed.hostname)) {
      throw new BadRequestException(
        'Webhook URL must not point to a local or internal address',
      );
    }

    // Block common private IP ranges
    const ip = parsed.hostname;
    if (
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    ) {
      throw new BadRequestException(
        'Webhook URL must not point to a private network address',
      );
    }

    return parsed;
  }

  private buildAuthHeader(
    auth: WebhookCallback['auth'],
  ): Record<string, string> {
    if (!auth) return {};

    if (auth.type === 'basic' && auth.username && auth.password) {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString(
        'base64',
      );
      return { Authorization: `Basic ${encoded}` };
    }

    if (auth.type === 'bearer' && auth.token) {
      return { Authorization: `Bearer ${auth.token}` };
    }

    return {};
  }

  private maskSensitive(obj: Record<string, unknown>): Record<string, unknown> {
    const masked = { ...obj };
    for (const key of Object.keys(masked)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower === 'authorization'
      ) {
        masked[key] = '***';
      } else if (
        typeof masked[key] === 'object' &&
        masked[key] !== null &&
        !Array.isArray(masked[key])
      ) {
        masked[key] = this.maskSensitive(
          masked[key] as Record<string, unknown>,
        );
      }
    }
    return masked;
  }

  async dispatch(
    callback: WebhookCallback,
    payload: Record<string, unknown>,
    logContext?: WebhookLogContext,
  ) {
    this.validateUrl(callback.url);

    const startTime = Date.now();

    try {
      const response = await fetch(callback.url, {
        method: callback.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.buildAuthHeader(callback.auth),
          ...callback.headers,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Webhook dispatched to ${callback.url} — status ${response.status}`,
      );

      if (logContext && this.logsService) {
        void this.logsService
          .create({
            userId: logContext.userId,
            apiKeyId: logContext.apiKeyId ?? null,
            method: (callback.method || 'POST').toUpperCase(),
            path: callback.url,
            requestBody: this.maskSensitive(payload) as Prisma.InputJsonValue,
            responseBody: {
              status: response.status,
              statusText: response.statusText,
            },
            statusCode: response.status,
            durationMs,
            direction: 'outbound',
          })
          .catch((err: unknown) => {
            this.logger.error('Failed to write outbound API log', err);
          });
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.logger.error(
        `Webhook dispatch failed for ${callback.url}: ${error}`,
      );

      if (logContext && this.logsService) {
        void this.logsService
          .create({
            userId: logContext.userId,
            apiKeyId: logContext.apiKeyId ?? null,
            method: (callback.method || 'POST').toUpperCase(),
            path: callback.url,
            requestBody: this.maskSensitive(payload) as Prisma.InputJsonValue,
            responseBody: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            statusCode: 0,
            durationMs,
            direction: 'outbound',
          })
          .catch((err: unknown) => {
            this.logger.error('Failed to write outbound API log', err);
          });
      }
    }
  }
}
