'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Activity,
  ChevronRight,
  Loader2,
  Radio,
  Wrench,
  History,
  Clock,
  Sparkles,
  Boxes,
  FolderTree,
  KeyRound,
  ScrollText,
  Settings,
} from 'lucide-react';
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
import { manageApi } from '@/components/manage/manage-api';
import { useAgentUsage, bucketTokens, type UsageBucket } from '@/components/manage/use-agent-usage';
import { getAvatarColor } from '@/lib/avatar';
import { formatCompactNumber } from '@/lib/format-number';
import { cn } from '@/lib/utils';

interface HealthResponse {
  status?: string;
  uptime?: number;
  sessions?: number;
  [k: string]: unknown;
}

interface ChannelListResponse {
  channels: Record<string, Record<string, unknown>>;
}

interface McpServerSummary {
  name: string;
  enabled: boolean;
  connected: boolean;
  transport: string;
  tools: string[];
}

interface McpListResponse {
  items: McpServerSummary[];
}

const QUICK_LINKS = [
  { key: 'audit', label: 'Audit log', description: 'Events & tool calls.', icon: History },
  { key: 'channels', label: 'Channels', description: 'Connected surfaces.', icon: Radio },
  { key: 'cron', label: 'Cron', description: 'Scheduled jobs.', icon: Clock },
  { key: 'mcp', label: 'MCP', description: 'External servers.', icon: Boxes },
  { key: 'credentials', label: 'Credentials', description: 'Provider keys.', icon: KeyRound },
  { key: 'workspace', label: 'Workspace', description: 'Agent files.', icon: FolderTree },
  { key: 'skills', label: 'Skills', description: 'Custom behaviors.', icon: Sparkles },
  { key: 'scripts', label: 'Scripts', description: 'Startup helpers.', icon: ScrollText },
  { key: 'settings', label: 'Settings', description: 'Models & defaults.', icon: Settings },
] as const;

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return formatCompactNumber(n);
}

export default function AgentOverviewPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const { agents } = useAgentsContext();
  const agent = agents.find((a) => a.id === agentId);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [channels, setChannels] = useState<string[] | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerSummary[] | null>(null);

  // Health probe
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      setHealthLoading(true);
      try {
        const data = await manageApi<HealthResponse>(agentId, 'health', { signal });
        if (!signal.aborted) setHealth(data);
      } catch (e) {
        if (!signal.aborted) setHealthError(e instanceof Error ? e.message : 'Unreachable');
      } finally {
        if (!signal.aborted) setHealthLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [agentId]);

  // Channels + MCP summaries (quick-look cards)
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const data = await manageApi<ChannelListResponse>(agentId, 'channels', { signal });
        if (!signal.aborted) setChannels(Object.keys(data.channels ?? {}).sort());
      } catch {
        if (!signal.aborted) setChannels([]);
      }
    })();
    (async () => {
      try {
        const data = await manageApi<McpListResponse>(agentId, 'mcp', { signal });
        if (!signal.aborted) setMcpServers(data.items ?? []);
      } catch {
        if (!signal.aborted) setMcpServers([]);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [agentId]);

  // Subagents (HITL / managed sub-channels) registered in Placet whose
  // parent is this agent. Used to expand the "placet" channel row with
  // named sub-channel entries.
  const subagents = useMemo(
    () => agents.filter((a) => a.parentAgentId === agentId && a.isSubagent),
    [agents, agentId],
  );

  // Usage: two parallel queries (by date for chart, by model for breakdown)
  const usageByDate = useAgentUsage(agentId, { days: 14, groupBy: ['date'] });
  const usageByModel = useAgentUsage(agentId, { days: 14, groupBy: ['model'] });

  const uptimeLabel = useMemo(() => formatUptime(health?.uptime), [health]);

  const totals = usageByDate.data?.totals;
  const totalTokens = totals ? (totals.prompt_tokens ?? 0) + (totals.completion_tokens ?? 0) : 0;

  // Build daily chart series — one agent series of its own tokens.
  const dailyChart = useMemo(() => {
    const data = usageByDate.data;
    if (!data) return null;
    const days = data.items
      .map((b) => b.date)
      .filter((d): d is string => !!d)
      .sort();
    const byDate: Record<string, number> = {};
    for (const b of data.items) {
      if (b.date) byDate[b.date] = bucketTokens(b);
    }
    const totals: Record<string, number> = { ...byDate };
    return {
      days,
      totals,
      series: [
        {
          id: agentId,
          name: agent?.name ?? 'Agent',
          byDate,
          total: Object.values(byDate).reduce((a, b) => a + b, 0),
          color: agent ? getAvatarColor(agent.name) : undefined,
        },
      ],
    };
  }, [usageByDate.data, agent, agentId]);

  // Per-model breakdown for the MiniBarChart.
  const modelBars = useMemo(() => {
    const items = usageByModel.data?.items ?? [];
    return items
      .map((b: UsageBucket) => ({
        label: b.model || 'unknown',
        value: bucketTokens(b),
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [usageByModel.data]);

  return (
    <ManagePane
      title={
        <span className="flex items-center gap-3">
          {agent && (
            <AgentAvatar
              name={agent.name}
              avatarUrl={
                agent.avatarUrl
                  ? `/api/agents/${agent.id}/avatar?v=${encodeURIComponent(agent.avatarUrl)}`
                  : null
              }
              size="sm"
            />
          )}
          {agent?.name ?? 'Agent'}
        </span>
      }
      subtitle={agent?.managementUrl ?? undefined}
      backHref="/manage"
      actions={
        healthLoading ? (
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        ) : (
          <Activity
            size={16}
            className={cn(
              healthError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
            )}
          />
        )
      }
    >
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ManageStatTile
          label="Status"
          value={healthError ? 'Error' : (health?.status ?? 'ok')}
          tone={healthError ? 'error' : 'ok'}
          hint={healthError ?? 'Health OK'}
        />
        <ManageStatTile label="Active sessions" value={formatNumber(health?.sessions)} />
        <ManageStatTile label="Uptime" value={uptimeLabel} />
        <ManageStatTile
          label="Tokens · 14d"
          value={formatNumber(totalTokens)}
          tone="primary"
          hint={
            totals
              ? `${formatNumber(totals.turn_count)} turns · ${formatNumber(totals.tool_calls_count)} tools`
              : undefined
          }
        />
      </div>

      {/* Usage section */}
      <ManageSection
        title="Token usage · last 14 days"
        description={usageByDate.error ? `Unable to load: ${usageByDate.error}` : undefined}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
          <ManageCard title="Tokens per day">
            {dailyChart ? (
              <StackedDailyBarChart
                days={dailyChart.days}
                series={dailyChart.series}
                totals={dailyChart.totals}
              />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground italic">
                {usageByDate.loading ? 'Loading token usage…' : 'No usage in this window.'}
              </div>
            )}
          </ManageCard>

          <ManageCard title="By model">
            {modelBars.length > 0 ? (
              <MiniBarChart data={modelBars} />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground italic">
                {usageByModel.loading ? 'Loading…' : 'No model usage recorded.'}
              </div>
            )}
          </ManageCard>
        </div>
      </ManageSection>

      {/* Secondary breakdown: tool calls / iterations / duration */}
      {totals && (
        <ManageSection title="Activity totals">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ManageStatTile label="Prompt tokens" value={formatNumber(totals.prompt_tokens)} />
            <ManageStatTile
              label="Completion tokens"
              value={formatNumber(totals.completion_tokens)}
            />
            <ManageStatTile label="Cached tokens" value={formatNumber(totals.cached_tokens)} />
            <ManageStatTile
              label="Duration"
              value={totals.duration_ms ? `${(totals.duration_ms / 1000).toFixed(1)} s` : '—'}
            />
          </div>
        </ManageSection>
      )}

      {/* Quick-look summaries: connected channels + tools from MCP */}
      <ManageSection title="Quick look">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ManageCard
            title={
              <span className="flex items-center gap-2">
                <Radio size={14} className="text-muted-foreground" />
                Connected channels
                {channels && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({channels.length + subagents.length})
                  </span>
                )}
              </span>
            }
            actions={
              <Link
                href={`/manage/${agentId}/channels`}
                className="text-sm text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Manage <ChevronRight size={12} />
              </Link>
            }
          >
            {channels === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : channels.length === 0 && subagents.length === 0 ? (
              <ManageEmptyState
                icon={Radio}
                title="No channels configured"
                description="Configure a channel to connect this agent to a chat surface."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {channels.map((name) => {
                  // Sub-channels only exist for the `placet` channel.
                  const children = name === 'placet' ? subagents : [];
                  return (
                    <li key={name}>
                      <div className="flex items-center justify-between py-2 text-sm">
                        <span className="font-medium truncate">{name}</span>
                        <span className="font-mono text-muted-foreground shrink-0">{name}</span>
                      </div>
                      {children.length > 0 && (
                        <ul className="pb-1">
                          {children.map((sub) => (
                            <li
                              key={sub.id}
                              className="flex items-center justify-between pl-4 py-1 text-sm text-muted-foreground"
                            >
                              <span className="truncate flex items-center gap-1.5">
                                <ChevronRight size={12} className="shrink-0" />
                                {sub.name}
                              </span>
                              <span className="font-mono shrink-0">{name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ManageCard>

          <ManageCard
            title={
              <span className="flex items-center gap-2">
                <Wrench size={14} className="text-muted-foreground" />
                Active tools
                {mcpServers && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({mcpServers.length})
                  </span>
                )}
              </span>
            }
            actions={
              <Link
                href={`/manage/${agentId}/mcp`}
                className="text-sm text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Configure <ChevronRight size={12} />
              </Link>
            }
          >
            {mcpServers === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : mcpServers.length === 0 ? (
              <ManageEmptyState
                icon={Wrench}
                title="No MCP servers"
                description="Add an MCP server to surface external tools to this agent."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {mcpServers.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          s.connected
                            ? 'bg-emerald-500'
                            : s.enabled
                              ? 'bg-amber-500'
                              : 'bg-muted-foreground/40',
                        )}
                        aria-hidden
                      />
                      <span className="font-medium truncate">{s.name}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {s.connected
                        ? `${s.tools.length} tools available`
                        : s.enabled
                          ? 'disconnected'
                          : 'disabled'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ManageCard>
        </div>
      </ManageSection>

      {/* Navigation tiles */}
      <ManageSection title="Sections">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {QUICK_LINKS.map(({ key, label, description, icon: Icon }) => (
            <Link
              key={key}
              href={`/manage/${agentId}/${key}`}
              className="group flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card shadow-xs hover:border-primary/40 transition-colors"
            >
              <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                <Icon size={16} className="text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{label}</p>
                <p className="text-sm text-muted-foreground truncate">{description}</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      </ManageSection>
    </ManagePane>
  );
}
