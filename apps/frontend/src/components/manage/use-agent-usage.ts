'use client';

import { useEffect, useState } from 'react';
import {
  manageAgentUsage,
  trailingDateRange,
  type UsageQueryParams,
} from '@/components/manage/manage-api';

export interface UsageTotals {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  tool_calls_count: number;
  iterations: number;
  duration_ms: number;
  turn_count: number;
}

export interface UsageBucket extends Partial<UsageTotals> {
  // One of these will be present depending on groupBy
  date?: string;
  model?: string;
  origin?: string;
  channel?: string;
  session_key?: string;
}

export interface UsageResponse {
  from: string;
  to: string;
  groupBy: string[];
  items: UsageBucket[];
  totals: UsageTotals;
}

interface UsageState {
  data: UsageResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch usage for a single agent. Pure data hook — renders nothing, so page
 * components stay focused on layout.
 */
export function useAgentUsage(
  agentId: string,
  opts: {
    days?: number;
    groupBy?: UsageQueryParams['groupBy'];
  } = {},
): UsageState {
  const { days = 14, groupBy = ['date'] } = opts;
  const [state, setState] = useState<UsageState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const { from, to } = trailingDateRange(days);
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const data = await manageAgentUsage<UsageResponse>(agentId, {
          from,
          to,
          groupBy,
        });
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (e) {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to load usage',
          });
      }
    })();
    return () => {
      cancelled = true;
    };
    // groupBy array identity is stable when callers pass a literal; re-run on key change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, days, groupBy.join(',')]);

  return state;
}

/** Sum helper used by chart code. */
export function bucketTokens(b: UsageBucket): number {
  return (b.prompt_tokens ?? 0) + (b.completion_tokens ?? 0);
}
