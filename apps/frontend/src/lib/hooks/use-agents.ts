'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Agent } from '@humanproxy/shared';
import { api } from '@/lib/api';

export interface AgentWithLastMessage extends Agent {
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentWithLastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api<AgentWithLastMessage[]>('/api/agents');
      setAgents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  return { agents, loading, error, refetch: fetchAgents };
}
