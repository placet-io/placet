import { Injectable, Logger } from '@nestjs/common';
import { AgentsService } from '../agents/agents.service';
import { ManagementClient } from './management-client.service';

/**
 * Shape returned to the frontend dashboard.
 *
 * `days` is an ascending list of ISO dates (YYYY-MM-DD), always length == days
 * requested. `agents[].byDate[date]` is the total prompt+completion tokens for
 * that agent on that day (0 when missing). `totals[date]` is the per-day sum.
 */
export interface DailyUsageResponse {
  from: string;
  to: string;
  days: string[];
  agents: Array<{
    id: string;
    name: string;
    byDate: Record<string, number>;
    total: number;
    status: 'ok' | 'error';
    error?: string;
  }>;
  totals: Record<string, number>;
}

interface CacheEntry {
  expiresAt: number;
  promise: Promise<DailyUsageResponse>;
}

interface UsageBucket {
  date?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface UsageQueryResponse {
  items?: UsageBucket[];
}

@Injectable()
export class DailyUsageService {
  private readonly logger = new Logger(DailyUsageService.name);
  private static readonly TTL_MS = 60_000; // 1 minute cache per (ownerId, days)
  private static readonly MAX_DAYS = 30;
  private static readonly MAX_CACHE_ENTRIES = 256;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly agents: AgentsService,
    private readonly client: ManagementClient,
  ) {}

  async getDailyUsage(
    ownerId: string,
    days: number,
  ): Promise<DailyUsageResponse> {
    const clampedDays = Math.max(
      1,
      Math.min(DailyUsageService.MAX_DAYS, days || 14),
    );
    const key = `${ownerId}:${clampedDays}`;
    const now = Date.now();
    this.sweepExpired(now);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.promise;

    const promise = this.compute(ownerId, clampedDays).catch((err) => {
      // On failure, invalidate so next request retries.
      this.cache.delete(key);
      throw err;
    });
    this.cache.set(key, { expiresAt: now + DailyUsageService.TTL_MS, promise });
    return promise;
  }

  private sweepExpired(now: number): void {
    for (const [k, v] of this.cache) {
      if (v.expiresAt <= now) this.cache.delete(k);
    }
    // Hard cap to prevent unbounded growth from many distinct (owner, days).
    if (this.cache.size > DailyUsageService.MAX_CACHE_ENTRIES) {
      const excess = this.cache.size - DailyUsageService.MAX_CACHE_ENTRIES;
      const it: IterableIterator<string> = this.cache.keys();
      for (let i = 0; i < excess; i++) {
        const next = it.next();
        if (next.done) break;
        this.cache.delete(next.value);
      }
    }
  }

  /** Invalidate all cached entries for an owner (agent roster changed). */
  bust(ownerId: string): void {
    const prefix = `${ownerId}:`;
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) this.cache.delete(k);
    }
  }

  private async compute(
    ownerId: string,
    days: number,
  ): Promise<DailyUsageResponse> {
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));

    const toIso = toDate(to);
    const fromIso = toDate(from);
    const dayKeys = enumerateDays(from, to);

    const all = await this.agents.findAllByOwnerSimple(ownerId);
    const manageable = all.filter(
      (a) =>
        a.isSubagent !== true &&
        typeof a.managementUrl === 'string' &&
        a.managementUrl,
    );

    const results = await mapWithConcurrency(manageable, 8, async (agent) => {
      const byDate: Record<string, number> = {};
      for (const d of dayKeys) byDate[d] = 0;
      let total = 0;
      try {
        const resp = await this.client.request<UsageQueryResponse>({
          agentId: agent.id,
          ownerId,
          method: 'GET',
          path: 'usage',
          query: { from: fromIso, to: toIso, groupBy: 'date' },
        });
        for (const item of resp.items ?? []) {
          const d = item.date;
          if (!d || !(d in byDate)) continue;
          const v = (item.prompt_tokens ?? 0) + (item.completion_tokens ?? 0);
          byDate[d] = v;
          total += v;
        }
        return {
          id: agent.id,
          name: agent.name,
          byDate,
          total,
          status: 'ok' as const,
        };
      } catch (err) {
        const message = (err as Error).message;
        this.logger.warn(
          `Daily usage fetch failed for agent ${agent.id}: ${message}`,
        );
        return {
          id: agent.id,
          name: agent.name,
          byDate,
          total,
          status: 'error' as const,
          error: message,
        };
      }
    });

    const totals: Record<string, number> = {};
    for (const d of dayKeys) totals[d] = 0;
    for (const a of results) {
      for (const d of dayKeys) totals[d] += a.byDate[d] ?? 0;
    }

    return {
      from: fromIso,
      to: toIso,
      days: dayKeys,
      agents: results.sort((a, b) => b.total - a.total),
      totals,
    };
  }
}

function toDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function enumerateDays(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    out.push(toDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Runs `fn` over `items` with at most `limit` workers in flight at once.
 * Avoids stampeding the management hosts when an owner has many agents.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
