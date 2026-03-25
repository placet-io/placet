'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { cn } from '@/lib/utils';

interface ChatListItemProps {
  agentId: string;
  name: string;
  avatarUrl?: string | null;
  description?: string | null;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  isActive?: boolean;
}

export const ChatListItem = memo(function ChatListItem({
  agentId,
  name,
  avatarUrl,
  description,
  lastMessage,
  lastMessageTime,
  unreadCount = 0,
  isActive = false,
}: ChatListItemProps) {
  return (
    <Link
      href={`/chats/${agentId}`}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200',
        isActive ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <AgentAvatar name={name} avatarUrl={avatarUrl} size="md" className="shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <h3 className="truncate text-sm font-medium text-foreground">{name}</h3>
          {lastMessageTime && (
            <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
              {lastMessageTime}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {lastMessage ?? description ?? 'No messages yet'}
          </p>
          {unreadCount > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 rounded-full text-[10px] font-semibold shrink-0">
              {unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
});
