'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, AgentStatus, Message } from '@placet/shared';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/contexts/socket-context';

export interface AgentWithLastMessage extends Agent {
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentWithLastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, connected, activeChannel } = useSocket();

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

  // Listen for real-time messages to update sidebar (last message + unread)
  // Keep a ref to activeChannel so the socket handler never sees a stale value
  const activeRef = useRef(activeChannel);
  activeRef.current = activeChannel;

  useEffect(() => {
    if (!socket || !connected) return;

    const handleMessage = (msg: Message) => {
      setAgents((prev) =>
        prev.map((a) => {
          if (a.id !== msg.channelId) return a;
          const isViewing = activeRef.current === msg.channelId;
          return {
            ...a,
            lastMessage: msg.text ?? '📎 Attachment',
            lastMessageTime: msg.createdAt,
            // Only increment unread for agent messages when chat is NOT active
            unreadCount:
              msg.senderType === 'agent' && !isViewing ? (a.unreadCount ?? 0) + 1 : a.unreadCount,
          };
        }),
      );
    };

    const handleStatus = (data: {
      agentId: string;
      status: AgentStatus;
      statusMessage?: string;
      statusSince?: string;
    }) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === data.agentId
            ? {
                ...a,
                status: data.status,
                statusMessage: data.statusMessage ?? a.statusMessage,
                statusSince: data.statusSince ?? a.statusSince,
              }
            : a,
        ),
      );
    };

    socket.on('message:created', handleMessage);
    socket.on('agent:status', handleStatus);

    return () => {
      socket.off('message:created', handleMessage);
      socket.off('agent:status', handleStatus);
    };
  }, [socket, connected]);

  const clearUnread = useCallback((channelId: string) => {
    setAgents((prev) => prev.map((a) => (a.id === channelId ? { ...a, unreadCount: 0 } : a)));
  }, []);

  return { agents, loading, error, refetch: fetchAgents, clearUnread };
}
