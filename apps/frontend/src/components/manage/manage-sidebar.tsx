'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  Activity,
  History,
  KeyRound,
  Clock,
  Boxes,
  FolderTree,
  Sparkles,
  ScrollText,
  Radio,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { useAgentsContext } from '@/lib/contexts/agents-context';
import { cn } from '@/lib/utils';

const AGENT_SECTIONS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'audit', label: 'Audit Log', icon: History },
  { key: 'credentials', label: 'Credentials', icon: KeyRound },
  { key: 'cron', label: 'Cron', icon: Clock },
  { key: 'mcp', label: 'MCP', icon: Boxes },
  { key: 'workspace', label: 'Workspace', icon: FolderTree },
  { key: 'skills', label: 'Skills', icon: Sparkles },
  { key: 'scripts', label: 'Scripts', icon: ScrollText },
  { key: 'channels', label: 'Channels', icon: Radio },
  { key: 'policy', label: 'Policy', icon: ShieldCheck },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const;

interface ManageSidebarProps {
  className?: string;
}

export const ManageSidebar = memo(function ManageSidebar({ className }: ManageSidebarProps) {
  const pathname = usePathname();
  const params = useParams<{ agentId?: string }>();
  const activeAgentId = params.agentId;
  const { agents, loading } = useAgentsContext();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Only top-level agents with management credentials are listed.
  const manageable = useMemo(
    () =>
      agents.filter(
        (a) => a.isSubagent !== true && typeof a.managementUrl === 'string' && a.managementUrl,
      ),
    [agents],
  );

  const isDashboardActive = pathname === '/manage';

  return (
    <div
      className={cn(
        'flex h-full w-full lg:w-56 xl:w-62 shrink-0 flex-col bg-card lg:rounded-r-2xl lg:rounded-l-none lg:border-l-0 overflow-hidden shadow-xs border border-border/50 border-b-0 border-t-0 lg:border-t lg:border-b',
        className,
      )}
    >
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <MobileNavDrawer />
          <h1 className="text-xl font-semibold text-foreground">Manage</h1>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {/* Global dashboard entry */}
          <Link
            href="/manage"
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg transition-colors',
              isDashboardActive
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/50 text-foreground',
            )}
          >
            <LayoutDashboard size={18} className="shrink-0" />
            <span className="flex-1 text-sm font-semibold">Dashboard</span>
          </Link>

          <div className="px-3 pt-4 pb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Agents
          </div>

          {loading && manageable.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
          )}

          {!loading && manageable.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No agents have registered management credentials yet.
            </div>
          )}

          {manageable.map((agent) => {
            const isOpen = expanded[agent.id] ?? agent.id === activeAgentId;
            const isAgentActive = agent.id === activeAgentId;
            return (
              <div key={agent.id}>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [agent.id]: !isOpen }))}
                  className={cn(
                    'w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors',
                    isAgentActive ? 'bg-muted' : 'hover:bg-muted/50',
                  )}
                >
                  <AgentAvatar
                    name={agent.name}
                    avatarUrl={
                      agent.avatarUrl
                        ? `/api/agents/${agent.id}/avatar?v=${encodeURIComponent(agent.avatarUrl)}`
                        : null
                    }
                    size="sm"
                  />
                  <span className="flex-1 truncate text-sm font-medium">{agent.name}</span>
                  {isOpen ? (
                    <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="ml-5 mt-0.5 mb-2 space-y-0.5 border-l border-border/60 pl-2">
                    {AGENT_SECTIONS.map(({ key, label, icon: Icon }) => {
                      const href =
                        key === 'overview' ? `/manage/${agent.id}` : `/manage/${agent.id}/${key}`;
                      const active =
                        key === 'overview'
                          ? pathname === href
                          : pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <Link
                          key={key}
                          href={href}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                            active
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                          )}
                        >
                          <Icon size={14} className="shrink-0" />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
});
