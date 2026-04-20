import { Injectable, Logger } from '@nestjs/common';

export interface OAuthFlowState {
  channelId: string;
  provider: string;
  createdAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class OAuthRelayService {
  private readonly logger = new Logger(OAuthRelayService.name);
  private readonly pending = new Map<string, OAuthFlowState>();

  /**
   * Register a pending OAuth flow.  The state parameter is used as the lookup
   * key when the callback arrives.
   */
  register(state: string, channelId: string, provider: string): void {
    this.pending.set(state, { channelId, provider, createdAt: Date.now() });
    this.logger.log(
      `OAuth flow registered: state=${state.slice(0, 8)}… provider=${provider} channel=${channelId}`,
    );
  }

  /**
   * Resolve and consume a pending OAuth state.  Returns null if not found or
   * expired.
   */
  consume(state: string): OAuthFlowState | null {
    const entry = this.pending.get(state);
    if (!entry) return null;

    this.pending.delete(state);

    if (Date.now() - entry.createdAt > STATE_TTL_MS) {
      this.logger.warn(`OAuth state expired: ${state.slice(0, 8)}…`);
      return null;
    }

    return entry;
  }

  /**
   * Periodic cleanup of stale entries (called every minute by NestJS scheduler).
   */
  cleanup(): void {
    const now = Date.now();
    for (const [state, entry] of this.pending) {
      if (now - entry.createdAt > STATE_TTL_MS) {
        this.pending.delete(state);
      }
    }
  }
}
