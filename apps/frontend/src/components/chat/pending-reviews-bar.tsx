'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/contexts/socket-context';
import type { Message } from '@placet/shared';

const MAX_VISIBLE = 5;

interface PendingReviewsBarProps {
  channelId: string;
  className?: string;
}

/**
 * Floating bar at the top of the chat showing pending reviews.
 * Fetches pending reviews directly from the API instead of relying on loaded messages.
 * Clicking an entry scrolls to the review message.
 */
export const PendingReviewsBar = memo(function PendingReviewsBar({
  channelId,
  className,
}: PendingReviewsBarProps) {
  const [reviews, setReviews] = useState<Message[]>([]);
  const { socket, connected } = useSocket();

  // Fetch pending reviews for this channel
  useEffect(() => {
    let cancelled = false;
    api<Message[]>(`/api/messages/reviews?status=pending&channel=${channelId}`)
      .then((data) => {
        if (!cancelled) setReviews(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Keep in sync via WebSocket events
  useEffect(() => {
    if (!socket || !connected) return;

    const handleCreated = (msg: Message) => {
      if (msg.channelId !== channelId) return;
      if ((msg.review as Record<string, unknown> | null)?.status === 'pending') {
        setReviews((prev) => {
          if (prev.some((r) => r.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      }
    };

    const handleResponded = (msg: Message) => {
      if (msg.channelId !== channelId) return;
      setReviews((prev) => prev.filter((r) => r.id !== msg.id));
    };

    const handleExpired = (data: { messageId: string }) => {
      setReviews((prev) => prev.filter((r) => r.id !== data.messageId));
    };

    socket.on('message:created', handleCreated);
    socket.on('review:responded', handleResponded);
    socket.on('review:expired', handleExpired);
    return () => {
      socket.off('message:created', handleCreated);
      socket.off('review:responded', handleResponded);
      socket.off('review:expired', handleExpired);
    };
  }, [socket, connected, channelId]);

  // Deduplicate iteration chains — keep only latest per group
  const pendingEntries = useMemo(() => {
    const seen = new Map<string, Message>();
    const standalone: Message[] = [];

    for (const msg of reviews) {
      if (msg.iterationGroupId) {
        const existing = seen.get(msg.iterationGroupId);
        if (!existing || (msg.iteration ?? 0) > (existing.iteration ?? 0)) {
          seen.set(msg.iterationGroupId, msg);
        }
      } else {
        standalone.push(msg);
      }
    }

    return [...standalone, ...seen.values()];
  }, [reviews]);

  const handleClick = useCallback((messageId: string) => {
    const el = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-highlight');
      setTimeout(() => el.classList.remove('animate-highlight'), 2000);
    }
  }, []);

  if (pendingEntries.length === 0) return null;

  const visible = pendingEntries.slice(0, MAX_VISIBLE);
  const remaining = pendingEntries.length - visible.length;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200',
        className,
      )}
    >
      <AlertCircle size={14} className="shrink-0" />
      <span className="text-xs font-medium shrink-0">
        {pendingEntries.length} open review{pendingEntries.length !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {visible.map((msg) => {
          const review = msg.review as Record<string, unknown>;
          return (
            <button
              key={msg.id}
              type="button"
              onClick={() => handleClick(msg.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap transition-colors bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60"
            >
              {msg.text
                ? msg.text.slice(0, 30) + (msg.text.length > 30 ? '…' : '')
                : ((review?.type as string) ?? 'Review')}
              {msg.iteration != null && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
                  v{msg.iteration}
                </Badge>
              )}
            </button>
          );
        })}
        {remaining > 0 && (
          <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/40">
            +{remaining} more
          </span>
        )}
      </div>
    </div>
  );
});
