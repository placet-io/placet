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

  const agentItems: AgentListItem[] = agents.map((a) => ({
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
