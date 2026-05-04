'use client';

import { useParams } from 'next/navigation';
import { ChatList } from '@/components/chat/chat-list';
import type { AgentListItem } from '@/components/chat/chat-list';
import { AgentsProvider, useAgentsContext } from '@/lib/contexts/agents-context';
import { formatRelativeTime } from '@/lib/format-date';

function ChatsLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams<{ agentId?: string }>();
  const agentId = params.agentId;
  const { agents } = useAgentsContext();

  // Sort by most-recent activity first using the raw ISO timestamps,
  // BEFORE mapping `lastMessageTime` to its formatted display value.
  // Sorting on the formatted string ("5 min ago") would produce NaN.
  const sortedAgents = agents.slice().sort((a, b) => {
    const ta = a.lastMessageTime
      ? new Date(a.lastMessageTime).getTime()
      : a.lastActiveAt
        ? new Date(a.lastActiveAt).getTime()
        : 0;
    const tb = b.lastMessageTime
      ? new Date(b.lastMessageTime).getTime()
      : b.lastActiveAt
        ? new Date(b.lastActiveAt).getTime()
        : 0;
    return tb - ta;
  });

  const agentItems: AgentListItem[] = sortedAgents.map((a) => ({
    id: a.id,
    name: a.name,
    avatarUrl: a.avatarUrl,
    description: a.description,
    lastMessage: a.lastMessage,
    lastMessageTime: a.lastMessageTime
      ? formatRelativeTime(a.lastMessageTime)
      : a.lastActiveAt
        ? formatRelativeTime(a.lastActiveAt)
        : undefined,
    unreadCount: a.unreadCount,
    tag: a.tag,
  }));

  return (
    <>
      {/* Sidebar — always rendered, hidden on mobile when a chat is open */}
      <ChatList
        agents={agentItems}
        activeAgentId={agentId}
        className={agentId ? 'hidden lg:flex' : undefined}
      />
      {children}
    </>
  );
}

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentsProvider>
      <ChatsLayoutInner>{children}</ChatsLayoutInner>
    </AgentsProvider>
  );
}
