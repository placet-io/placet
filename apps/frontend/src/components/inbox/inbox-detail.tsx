'use client';

import { memo, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { MessageBubble } from '@/components/chat/message-bubble';
import { formatRelativeTime, formatTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type { Attachment, Message, Review } from '@placet/shared';

interface InboxDetailProps {
  message: Message;
  agentName: string;
  agentAvatarUrl?: string | null;
  onRespond: (messageId: string, response: Record<string, unknown>) => Promise<unknown>;
}

export const InboxDetail = memo(function InboxDetail({
  message,
  agentName,
  agentAvatarUrl,
  onRespond,
}: InboxDetailProps) {
  const router = useRouter();
  const [responded, setResponded] = useState(false);

  const handleRespond = useCallback(
    async (messageId: string, response: Record<string, unknown>) => {
      await onRespond(messageId, response);
      setResponded(true);
      setTimeout(() => {
        router.push('/inbox');
      }, 1200);
    },
    [onRespond, router],
  );

  return (
    <div className="flex h-full flex-1 flex-col bg-card rounded-3xl overflow-hidden shadow-sm border border-border/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8 rounded-lg lg:hidden"
          onClick={() => router.push('/inbox')}
        >
          <ArrowLeft size={18} />
        </Button>
        <AgentAvatar name={agentName} avatarUrl={agentAvatarUrl} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground truncate">{agentName}</h2>
          <p className="text-[11px] text-muted-foreground">
            {formatRelativeTime(message.createdAt)} · {formatTime(message.createdAt)}
          </p>
        </div>
        <Link
          href={`/chats/${message.channelId}?messageId=${message.id}`}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground',
            'hover:text-foreground hover:bg-muted transition-colors',
          )}
        >
          <ExternalLink size={12} />
          <span className="hidden sm:inline">Open in Chat</span>
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {responded ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-success mb-3" />
            <p className="text-sm font-medium text-foreground">Response submitted</p>
            <p className="text-xs text-muted-foreground mt-1">Returning to inbox…</p>
          </div>
        ) : (
          <MessageBubble
            messageId={message.id}
            channelId={message.channelId}
            senderType="agent"
            senderName={agentName}
            avatarUrl={agentAvatarUrl}
            text={message.text ?? ''}
            createdAt={message.createdAt}
            status={message.status as 'info' | 'success' | 'warning' | 'error' | null | undefined}
            review={message.review as Review | null | undefined}
            metadata={message.metadata as Record<string, unknown> | null | undefined}
            attachments={(message.attachments ?? []) as Attachment[]}
            onReviewRespond={handleRespond}
          />
        )}
      </div>
    </div>
  );
});
