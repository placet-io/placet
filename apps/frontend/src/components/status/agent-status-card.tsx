'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { Agent, AgentStatsResponse, AgentStatus } from '@placet/shared';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format-date';

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; bg: string; text: string }> =
  {
    active: {
      label: 'Active',
      dot: 'bg-success',
      bg: 'bg-success-muted',
      text: 'text-success-foreground',
    },
    busy: {
      label: 'Busy',
      dot: 'bg-warning',
      bg: 'bg-warning-muted',
      text: 'text-warning-foreground',
    },
    error: {
      label: 'Error',
      dot: 'bg-error',
      bg: 'bg-error-muted',
      text: 'text-error-foreground',
    },
    offline: {
      label: 'Offline',
      dot: 'bg-muted-foreground',
      bg: 'bg-muted',
      text: 'text-muted-foreground',
    },
  };

function formatUptime(statusSince: string | null | undefined): string {
  if (!statusSince) return '—';
  const diff = Date.now() - new Date(statusSince).getTime();
  if (diff < 0) return '—';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours < 24) return `${hours}h ${remainMins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

interface AgentStatusRowProps {
  agent: Agent;
}

export const AgentStatusRow = memo(function AgentStatusRow({ agent }: AgentStatusRowProps) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<AgentStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const status = (agent.status ?? 'offline') as AgentStatus;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;

  // Fetch stats when row is first expanded
  useEffect(() => {
    if (!open || stats) return;
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await api<AgentStatsResponse>(`/api/agents/${agent.id}/stats`);
        if (!cancelled) setStats(data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [open, stats, agent.id]);

  return (
    <>
      {/* Desktop row */}
      <tr
        className="hidden md:table-row hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={toggle}
      >
        <td className="px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <AgentAvatar
                name={agent.name}
                avatarUrl={
                  agent.avatarUrl
                    ? `/api/agents/${agent.id}/avatar?v=${encodeURIComponent(agent.avatarUrl)}`
                    : null
                }
                size="sm"
              />
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                  cfg.dot,
                )}
              />
            </div>
            <div>
              <p className="font-medium text-foreground">{agent.name}</p>
              <p className="text-xs text-muted-foreground truncate max-w-48">
                {agent.statusMessage ?? agent.description ?? `ID: ${agent.id.slice(0, 8)}`}
              </p>
            </div>
          </div>
        </td>
        <td className="px-6 py-3.5">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold',
              cfg.bg,
              cfg.text,
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </span>
        </td>
        <td className="px-6 py-3.5 text-muted-foreground">
          {status !== 'offline' ? formatUptime(agent.statusSince) : '—'}
        </td>
        <td className="px-6 py-3.5 text-muted-foreground">
          {agent.lastActiveAt ? formatRelativeTime(agent.lastActiveAt) : 'Never'}
        </td>
        <td className="px-4 py-3.5 text-muted-foreground">
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </td>
      </tr>

      {/* Desktop expanded detail */}
      {open && (
        <tr className="hidden md:table-row bg-muted/20">
          <td colSpan={5} className="px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : stats ? (
              <AgentStatsPanel stats={stats} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Failed to load stats</p>
            )}
          </td>
        </tr>
      )}

      {/* Mobile card */}
      <div className="md:hidden">
        <button
          type="button"
          className="w-full text-left bg-muted/30 rounded-xl border border-border p-4 space-y-2"
          onClick={toggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <AgentAvatar
                  name={agent.name}
                  avatarUrl={
                    agent.avatarUrl
                      ? `/api/agents/${agent.id}/avatar?v=${encodeURIComponent(agent.avatarUrl)}`
                      : null
                  }
                  size="sm"
                />
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                    cfg.dot,
                  )}
                />
              </div>
              <div>
                <p className="font-medium text-foreground">{agent.name}</p>
                <p className="text-xs text-muted-foreground truncate max-w-40">
                  {agent.statusMessage ?? agent.description ?? ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold',
                  cfg.bg,
                  cfg.text,
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
              <ChevronDown
                size={14}
                className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Uptime: {status !== 'offline' ? formatUptime(agent.statusSince) : '—'}</span>
            <span>
              Last active: {agent.lastActiveAt ? formatRelativeTime(agent.lastActiveAt) : 'Never'}
            </span>
          </div>
        </button>
        {open && (
          <div className="mt-1 rounded-xl border border-border bg-muted/20 p-3">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : stats ? (
              <AgentStatsPanel stats={stats} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Failed to load stats</p>
            )}
          </div>
        )}
      </div>
    </>
  );
});

function AgentStatsPanel({ stats }: { stats: AgentStatsResponse }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatItem
        icon={<ArrowDownLeft size={14} className="text-info-foreground" />}
        iconBg="bg-info-muted"
        label="Inbound"
        value={stats.totalInbound}
      />
      <StatItem
        icon={<ArrowUpRight size={14} className="text-accent2-foreground" />}
        iconBg="bg-accent2-muted"
        label="Outbound"
        value={stats.totalOutbound}
      />
      <StatItem
        icon={<CheckCircle2 size={14} className="text-success-foreground" />}
        iconBg="bg-success-muted"
        label="Success"
        value={stats.successRequests}
      />
      <StatItem
        icon={<XCircle size={14} className="text-error-foreground" />}
        iconBg="bg-error-muted"
        label="Errors"
        value={stats.errorRequests}
      />
    </div>
  );
}

function StatItem({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 bg-background p-3 rounded-xl border border-border">
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
