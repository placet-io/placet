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
  tag?: string | null;
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
  tag,
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
        {tag && (
          <Badge variant="secondary" className="h-4 px-1.5 text-xs font-medium leading-none mb-0.5">
            {tag}
          </Badge>
        )}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <h3 className="truncate text-base font-medium text-foreground min-w-0 flex-1">{name}</h3>
          {lastMessageTime && (
            <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
              {lastMessageTime}
            </span>
          )}
        </div>
        <div className="relative flex items-center gap-2">
          <p className={cn('truncate text-sm text-muted-foreground', unreadCount > 0 && 'pr-7')}>
            {lastMessage ?? description ?? 'No messages yet'}
          </p>
          {unreadCount > 0 && (
            <Badge className="absolute right-0 h-5 min-w-5 px-1.5 rounded-full text-[11px] font-semibold">
              {unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
});
