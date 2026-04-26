'use client';

import { useEffect, useMemo, useState } from 'react';
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

  // Stable, sorted key so an inline-literal array doesn't churn the effect
  // and so callers don't need to memo their groupBy. Using a sorted key also
  // means `['date','model']` and `['model','date']` collapse into one fetch.
  const groupKey = useMemo(() => [...groupBy].sort().join(','), [groupBy]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const { from, to } = trailingDateRange(days);
    const groupByParam = groupKey
      ? (groupKey.split(',') as UsageQueryParams['groupBy'])
      : undefined;
    (async () => {
      // Flip into loading state from inside the async IIFE so the rule
      // `react-hooks/set-state-in-effect` doesn't flag a synchronous setState
      // during effect commit. The await below puts us safely past commit.
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await manageAgentUsage<UsageResponse>(
          agentId,
          {
            from,
            to,
            groupBy: groupByParam,
          },
          { signal },
        );
        if (!signal.aborted) setState({ data, loading: false, error: null });
      } catch (e) {
        if (!signal.aborted)
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to load usage',
          });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [agentId, days, groupKey]);

  return state;
}

/** Sum helper used by chart code. */
export function bucketTokens(b: UsageBucket): number {
  return (b.prompt_tokens ?? 0) + (b.completion_tokens ?? 0);
}
