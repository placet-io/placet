'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentCommand } from '@placet/shared';
import { useSocket } from '@/lib/contexts/socket-context';

/**
 * Provides slash commands for the active agent channel.
 *
 * Commands arrive in two ways:
 * 1. Real-time via `agent:commands` Socket.IO event (on agent connect)
 * 2. From the agent object fetched via REST (persisted in DB)
 *
 * The hook merges both sources, preferring the latest WS update.
 */
export function useCommands(channelId: string | null, agentCommands?: AgentCommand[] | null) {
  const [wsCommands, setWsCommands] = useState<AgentCommand[] | null>(null);
  const { socket, connected } = useSocket();

  // Prefer WS updates, fall back to REST-fetched data
  const commands = useMemo(() => wsCommands ?? agentCommands ?? [], [wsCommands, agentCommands]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket || !connected || !channelId) return;

    const handleCommands = (data: { channelId: string; commands: AgentCommand[] }) => {
      if (data.channelId === channelId && data.commands) {
        setWsCommands(data.commands);
      }
    };

    socket.on('agent:commands', handleCommands);
    return () => {
      socket.off('agent:commands', handleCommands);
    };
  }, [socket, connected, channelId]);

  const filterCommands = useCallback(
    (query: string): AgentCommand[] => {
      if (!query) return commands;
      const lower = query.toLowerCase();
      return commands.filter(
        (c) =>
          c.command.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower),
      );
    },
    [commands],
  );

  return { commands, filterCommands };
}
