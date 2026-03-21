import { BadRequestException, Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

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

  async dispatch(callback: WebhookCallback, payload: Record<string, unknown>) {
    this.validateUrl(callback.url);

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

      this.logger.log(
        `Webhook dispatched to ${callback.url} — status ${response.status}`,
      );
    } catch (error) {
      this.logger.error(
        `Webhook dispatch failed for ${callback.url}: ${error}`,
      );
    }
  }
}
