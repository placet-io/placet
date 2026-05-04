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

  // Background refresh: poll every 60 s while the tab is visible, and refetch
  // immediately whenever the tab becomes visible again (handles sleep / tab
  // switch / iOS PWA resume). The heartbeat is cheap and keeps the sidebar's
  // last-message + unread-count in sync even if a socket event was missed.
  useEffect(() => {
    const refresh = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      void fetchAgents();
    };
    const intervalId = setInterval(refresh, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onFocus = () => refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
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
          // Compute new unread count:
          //   - user messages never count as unread for the user themselves
          //   - if the chat is currently open, force to 0 (mirrors the
          //     server-side markRead the chat view triggers per message)
          //   - otherwise increment from existing count
          let unreadCount = a.unreadCount ?? 0;
          if (isViewing) {
            unreadCount = 0;
          } else if (msg.senderType === 'agent') {
            unreadCount = unreadCount + 1;
          }
          return {
            ...a,
            lastMessage: msg.text ?? '📎 Attachment',
            lastMessageTime: msg.createdAt,
            unreadCount,
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
