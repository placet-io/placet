'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, CircleCheck, CircleAlert, CircleOff, Loader2 } from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import {
  ManageCard,
  ManageSection,
  ManageStatTile,
  ManageEmptyState,
} from '@/components/manage/manage-ui';
import { MiniBarChart } from '@/components/manage/mini-bar-chart';
import { StackedDailyBarChart } from '@/components/manage/stacked-daily-bar-chart';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { useAgentsContext } from '@/lib/contexts/agents-context';
import { manageApi, manageDailyUsage } from '@/components/manage/manage-api';
import { getAvatarColor } from '@/lib/avatar';
import { formatCompactNumber } from '@/lib/format-number';
import { cn } from '@/lib/utils';

interface AgentHealth {
  id: string;
  name: string;
  status: 'ok' | 'error' | 'unknown';
  uptimeSec?: number;
  sessionCount?: number;
  errorMessage?: string;
}

interface HealthResponse {
  status?: string;
  uptime?: number;
  sessions?: number;
  [k: string]: unknown;
}

interface DailyUsageResponse {
  from: string;
  to: string;
  days: string[];
  agents: Array<{
    id: string;
    name: string;
    byDate: Record<string, number>;
    total: number;
  }>;
  totals: Record<string, number>;
}

const STATUS_META: Record<
  AgentHealth['status'],
  {
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    className: string;
  }
> = {
  ok: {
    label: 'Online',
    icon: CircleCheck,
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  error: { label: 'Error', icon: CircleAlert, className: 'text-destructive' },
  unknown: { label: 'Unknown', icon: CircleOff, className: 'text-muted-foreground' },
};

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function ManageOverviewPage() {
  const { agents, loading } = useAgentsContext();
  const [health, setHealth] = useState<Record<string, AgentHealth>>({});
  const [probing, setProbing] = useState(false);
  const [dailyUsage, setDailyUsage] = useState<DailyUsageResponse | null>(null);

  const manageable = useMemo(
    () =>
      agents.filter(
        (a) => a.isSubagent !== true && typeof a.managementUrl === 'string' && a.managementUrl,
      ),
    [agents],
  );

  useEffect(() => {
    if (manageable.length === 0) return;
    let cancelled = false;
    setProbing(true);
    (async () => {
      const probe = async (agent: (typeof manageable)[number]): Promise<AgentHealth> => {
        try {
          const data = await manageApi<HealthResponse>(agent.id, 'health');
          return {
            id: agent.id,
            name: agent.name,
            status: data.status === 'ok' || data.status === undefined ? 'ok' : 'error',
            uptimeSec: typeof data.uptime === 'number' ? data.uptime : undefined,
            sessionCount: typeof data.sessions === 'number' ? data.sessions : undefined,
          };
        } catch (err) {
          return {
            id: agent.id,
            name: agent.name,
            status: 'error',
            errorMessage: err instanceof Error ? err.message : 'Unreachable',
          };
        }
      };

      // Cap fan-out so a large fleet doesn't open hundreds of sockets at once.
      const CONCURRENCY = 6;
      const results = new Array<AgentHealth>(manageable.length);
      let cursor = 0;
      const workers = Array.from(
        { length: Math.max(1, Math.min(CONCURRENCY, manageable.length)) },
        async () => {
          while (!cancelled) {
            const i = cursor++;
            if (i >= manageable.length) return;
            results[i] = await probe(manageable[i]);
          }
        },
      );
      await Promise.all(workers);
      if (cancelled) return;
      const map: Record<string, AgentHealth> = {};
      for (const r of results) if (r) map[r.id] = r;
      setHealth(map);
      setProbing(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageable.map((a) => a.id).join(',')]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await manageDailyUsage<DailyUsageResponse>(14);
        if (!cancelled) setDailyUsage(data);
      } catch {
        if (!cancelled) setDailyUsage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionBars = useMemo(
    () =>
      manageable
        .map((a) => ({
          label: a.name,
          value: health[a.id]?.sessionCount ?? 0,
          color: getAvatarColor(a.name),
        }))
        .filter((b) => b.value > 0),
    [manageable, health],
  );

  // Tokens per agent · 14d — mirrors the sessions bar chart using the daily
  // usage payload we already fetch for the stacked chart above.
  const tokenBars = useMemo(
    () =>
      (dailyUsage?.agents ?? [])
        .map((a) => ({
          label: a.name,
          value: a.total,
          color: getAvatarColor(a.name),
        }))
        .filter((b) => b.value > 0),
    [dailyUsage],
  );

  const summary = useMemo(() => {
    const total = manageable.length;
    const online = Object.values(health).filter((h) => h.status === 'ok').length;
    const errored = Object.values(health).filter((h) => h.status === 'error').length;
    const tokens14d = dailyUsage
      ? Object.values(dailyUsage.totals).reduce((a, b) => a + b, 0)
      : null;
    const sessions = Object.values(health).reduce((sum, h) => sum + (h.sessionCount ?? 0), 0);
    return { total, online, errored, tokens14d, sessions };
  }, [manageable, health, dailyUsage]);

  return (
    <ManagePane
      title="Dashboard"
      subtitle="Live overview of every registered Facio agent"
      actions={
        probing ? (
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        ) : (
          <Activity size={16} className="text-muted-foreground" />
        )
      }
    >
      <ManageSection title="Token usage · last 14 days">
        <ManageCard>
          {dailyUsage ? (
            <StackedDailyBarChart
              days={dailyUsage.days}
              series={dailyUsage.agents}
              totals={dailyUsage.totals}
            />
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground italic">
              Loading token usage…
            </div>
          )}
        </ManageCard>
      </ManageSection>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <ManageStatTile label="Agents" value={summary.total} />
        <ManageStatTile label="Online" value={summary.online} tone="ok" />
        <ManageStatTile
          label="Errors"
          value={summary.errored}
          tone={summary.errored > 0 ? 'error' : 'muted'}
        />
        <ManageStatTile label="Active sessions" value={formatCompactNumber(summary.sessions)} />
        <ManageStatTile
          label="Tokens · 14d"
          value={formatCompactNumber(summary.tokens14d)}
          tone="primary"
        />
      </div>

      <ManageSection title="Per agent · last 14 days">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ManageCard title="Active sessions">
            <MiniBarChart
              data={sessionBars}
              emptyText={loading ? 'Loading agents…' : 'No active sessions.'}
            />
          </ManageCard>
          <ManageCard title="Tokens">
            <MiniBarChart
              data={tokenBars}
              emptyText={dailyUsage ? 'No usage in this window.' : 'Loading…'}
            />
          </ManageCard>
        </div>
      </ManageSection>

      <ManageSection title="Agents">
        {manageable.length === 0 && !loading ? (
          <ManageCard>
            <ManageEmptyState
              icon={Activity}
              title="No agents registered"
              description="Once an agent runs with a Facio management URL + API token, it will appear here."
            />
          </ManageCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {manageable.map((agent) => {
              const h = health[agent.id];
              const status = h?.status ?? 'unknown';
              const meta = STATUS_META[status];
              const StatusIcon = meta.icon;
              return (
                <Link
                  key={agent.id}
                  href={`/manage/${agent.id}`}
                  className="flex items-start gap-3 p-4 rounded-2xl border border-border/50 bg-card shadow-xs hover:border-primary/40 transition-colors"
                >
                  <AgentAvatar
                    name={agent.name}
                    avatarUrl={
                      agent.avatarUrl
                        ? `/api/agents/${agent.id}/avatar?v=${encodeURIComponent(agent.avatarUrl)}`
                        : null
                    }
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {agent.name}
                      </h3>
                      <StatusIcon size={14} className={cn('shrink-0', meta.className)} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground truncate">
                      {h?.errorMessage ?? agent.managementUrl}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        <span className="text-foreground font-medium">
                          {h?.sessionCount ?? '—'}
                        </span>{' '}
                        sessions
                      </span>
                      <span>
                        Uptime{' '}
                        <span className="text-foreground font-medium">
                          {formatUptime(h?.uptimeSec)}
                        </span>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </ManageSection>
    </ManagePane>
  );
}
