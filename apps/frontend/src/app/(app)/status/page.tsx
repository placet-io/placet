'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, Loader2, MessageSquare, RefreshCw, Wifi, XCircle } from 'lucide-react';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { useAgents } from '@/lib/hooks/use-agents';
import { AgentStatusRow } from '@/components/status/agent-status-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { GlobalStatsResponse } from '@humanproxy/shared';

export default function StatusPage() {
  const { agents, loading, error, refetch } = useAgents();
  const [globalStats, setGlobalStats] = useState<GlobalStatsResponse | null>(null);

  const fetchGlobalStats = useCallback(() => {
    api<GlobalStatsResponse>('/api/agents/stats')
      .then(setGlobalStats)
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    fetchGlobalStats();
  }, [fetchGlobalStats]);

  const handleRefresh = useCallback(() => {
    void refetch();
    fetchGlobalStats();
  }, [refetch, fetchGlobalStats]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-card rounded-3xl shadow-sm border border-border/50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div className="flex items-center gap-2">
            <MobileNavDrawer />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Agent Status</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {/* Global stats boxes */}
        {globalStats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <GlobalStatBox
              icon={<Bot size={18} />}
              label="Total Agents"
              value={globalStats.totalAgents}
              color="text-foreground"
            />
            <GlobalStatBox
              icon={<Wifi size={18} />}
              label="Active"
              value={globalStats.activeAgents}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <GlobalStatBox
              icon={<MessageSquare size={18} />}
              label="Messages"
              value={globalStats.totalMessages}
              color="text-blue-600 dark:text-blue-400"
            />
            <GlobalStatBox
              icon={<CheckCircle2 size={18} />}
              label="Success"
              value={globalStats.successRequests}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <GlobalStatBox
              icon={<XCircle size={18} />}
              label="Errors"
              value={globalStats.errorRequests}
              color="text-red-600 dark:text-red-400"
            />
          </div>
        )}

        {/* Content */}
        {loading && agents.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-24 text-sm text-muted-foreground">{error}</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground text-sm">
            No agents yet. Create an agent to see its status here.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-muted/30 rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-3.5 font-medium">Agent</th>
                    <th className="px-6 py-3.5 font-medium">Status</th>
                    <th className="px-6 py-3.5 font-medium">Uptime</th>
                    <th className="px-6 py-3.5 font-medium">Last Active</th>
                    <th className="px-4 py-3.5 font-medium w-10" />
                  </tr>
                </thead>
                <tbody className={cn('divide-y divide-border', loading && 'opacity-50')}>
                  {agents.map((agent) => (
                    <AgentStatusRow key={agent.id} agent={agent} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className={cn('md:hidden space-y-2', loading && 'opacity-50')}>
              {agents.map((agent) => (
                <AgentStatusRow key={agent.id} agent={agent} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GlobalStatBox({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-muted/30 rounded-2xl border border-border p-4">
      <div className={cn('mb-2', color)}>{icon}</div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
