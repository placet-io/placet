'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useAgents, type AgentWithLastMessage } from '@/lib/hooks/use-agents';
import { api } from '@/lib/api';
import type { Agent } from '@humanproxy/shared';

interface AgentsContextValue {
  agents: AgentWithLastMessage[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createAgent: (name: string) => Promise<Agent>;
}

const AgentsContext = createContext<AgentsContextValue | null>(null);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const agentsHook = useAgents();

  const createAgent = useCallback(
    async (name: string) => {
      const agent = await api<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      void agentsHook.refetch();
      return agent;
    },
    [agentsHook],
  );

  const value: AgentsContextValue = {
    ...agentsHook,
    createAgent,
  };

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgentsContext() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error('useAgentsContext must be used within AgentsProvider');
  return ctx;
}
