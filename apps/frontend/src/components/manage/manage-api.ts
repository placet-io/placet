import { api, apiText } from '@/lib/api';

/**
 * Thin wrapper around `api()` that targets the Placet backend's agent
 * management proxy (`/api/agents/:agentId/manage/*`). The proxy forwards
 * the request to the agent's upstream management API with a server-side
 * bearer token — the token never reaches the browser.
 */
export function manageApi<T = unknown>(
  agentId: string,
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return api<T>(`/api/agents/${agentId}/manage/${clean}`, opts);
}

export async function manageApiText(
  agentId: string,
  path: string,
  opts: RequestInit = {},
): Promise<string> {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return apiText(`/api/agents/${agentId}/manage/${clean}`, opts);
}

/**
 * Fan-out aggregation endpoint for the global dashboard. Returns a compact
 * overview of every non-sub-agent registered with management credentials.
 */
export function manageOverview<T = unknown>(opts: RequestInit = {}): Promise<T> {
  return api<T>('/api/agents/manage/overview', opts);
}

/**
 * Aggregated daily token usage (cached server-side). Returns the sum of
 * prompt+completion tokens per day per agent, for the trailing `days` window.
 */
export function manageDailyUsage<T = unknown>(days = 14, opts: RequestInit = {}): Promise<T> {
  return api<T>(`/api/manage/usage/daily?days=${days}`, opts);
}

export interface UsageQueryParams {
  from: string; // YYYY-MM-DD
  to: string;
  groupBy?: Array<'date' | 'model' | 'origin' | 'channel' | 'session_key'>;
  model?: string;
  origin?: string;
  channel?: string;
}

/**
 * Per-agent token usage breakdown. Proxies `GET /api/v1/usage` on the
 * agent's management API with flexible groupings.
 */
export function manageAgentUsage<T = unknown>(
  agentId: string,
  params: UsageQueryParams,
  opts: RequestInit = {},
): Promise<T> {
  const qs = new URLSearchParams();
  qs.set('from', params.from);
  qs.set('to', params.to);
  if (params.groupBy && params.groupBy.length) qs.set('groupBy', params.groupBy.join(','));
  if (params.model) qs.set('model', params.model);
  if (params.origin) qs.set('origin', params.origin);
  if (params.channel) qs.set('channel', params.channel);
  return manageApi<T>(agentId, `usage?${qs.toString()}`, opts);
}

/** Utility: returns [fromISODate, toISODate] for a trailing N-day window. */
export function trailingDateRange(days: number): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: fromDate.toISOString().slice(0, 10), to };
}
