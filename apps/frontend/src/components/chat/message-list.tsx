'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Copy, Check, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './message-bubble';
import type { Message } from '@placet/shared';

interface MessageListProps {
  messages: Message[];
  agentName: string;
  agentAvatarUrl?: string | null;
  channelId?: string;
  loading?: boolean;
  loadingOlder?: boolean;
  hasMore?: boolean;
  highlightMessageId?: string | null;
  onLoadOlder?: () => void;
  onSetupWebhook?: () => void;
  onReviewRespond?: (
    messageId: string,
    response: Record<string, unknown>,
    modifiedFileIds?: Record<string, string>,
    options?: { feedback?: string },
  ) => Promise<void>;
  onReply?: (messageId: string, senderName: string, text: string) => void;
  onSendAsMessage?: (attachmentId: string) => Promise<void>;
  onRetryDelivery?: (messageId: string) => Promise<void>;
}

export const MessageList = memo(function MessageList({
  messages,
  agentName,
  agentAvatarUrl,
  channelId,
  loading = false,
  loadingOlder = false,
  hasMore = false,
  highlightMessageId,
  onLoadOlder,
  onSetupWebhook,
  onReviewRespond,
  onReply,
  onSendAsMessage,
  onRetryDelivery,
}: MessageListProps) {
  const [copied, setCopied] = useState(false);

  // Compute max iteration per group for "Iteration X/Y" display
  const iterationTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const msg of messages) {
      const gid = msg.iterationGroupId;
      if (gid && msg.iteration != null) {
        totals.set(gid, Math.max(totals.get(gid) ?? 0, msg.iteration));
      }
    }
    return totals;
  }, [messages]);

  const handleCopyId = useCallback(() => {
    if (!channelId) return;
    void navigator.clipboard.writeText(channelId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [channelId]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);
  const prevLastIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef(0);

  // Auto-scroll to bottom on new messages (only if user is near the bottom)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;

    const lastId = messages[messages.length - 1].id;
    const isNewMessage =
      messages.length > prevLengthRef.current || lastId !== prevLastIdRef.current;
    const wasLoadingOlder = prevScrollHeightRef.current > 0;

    if (isNewMessage && !wasLoadingOlder) {
      // New message appended at bottom — scroll down
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prevLengthRef.current = messages.length;
    prevLastIdRef.current = lastId;
  }, [messages]);

  // Preserve scroll position when older messages are prepended
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !prevScrollHeightRef.current) return;

    const newScrollHeight = container.scrollHeight;
    const diff = newScrollHeight - prevScrollHeightRef.current;
    if (diff > 0) {
      container.scrollTop += diff;
    }
    prevScrollHeightRef.current = 0;
  }, [messages]);

  // Scroll handler to detect scroll-to-top for loading older messages
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMore || loadingOlder || !onLoadOlder) return;

    if (container.scrollTop < 100) {
      prevScrollHeightRef.current = container.scrollHeight;
      onLoadOlder();
    }
  }, [hasMore, loadingOlder, onLoadOlder]);

  // Initial scroll to bottom — keeps scrolling while content is still rendering
  // (iframes, images, markdown expand after the first paint).
  // Skipped when a highlight target is set (inbox → chat deep-link).
  useEffect(() => {
    if (loading || highlightMessageId) return;

    const container = scrollContainerRef.current;
    const bottom = bottomRef.current;
    if (!container || !bottom) return;

    // Immediate scroll
    bottom.scrollIntoView();

    // Watch for DOM mutations (lazy-rendered content changing heights)
    // and keep scrolling to bottom for the first ~1.5 s after load.
    let active = true;
    const timeout = setTimeout(() => {
      active = false;
      observer.disconnect();
    }, 1500);

    const scrollToBottom = () => {
      if (active) bottom.scrollIntoView();
    };

    const observer = new MutationObserver(() => {
      requestAnimationFrame(scrollToBottom);
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'height', 'src'],
    });

    return () => {
      active = false;
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [loading, highlightMessageId]);

  // Scroll to and highlight a specific message (e.g. from inbox "Open in Chat")
  useEffect(() => {
    if (loading || !highlightMessageId) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    // Small delay to let content render
    const timeout = setTimeout(() => {
      const el = container.querySelector(`[data-message-id="${CSS.escape(highlightMessageId)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-highlight');
      const cleanup = setTimeout(() => el.classList.remove('animate-highlight'), 2000);
      return () => clearTimeout(cleanup);
    }, 300);

    return () => clearTimeout(timeout);
  }, [loading, highlightMessageId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto scrollbar-hide"
    >
      <div className="p-6 space-y-4">
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!hasMore && messages.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-2">
            Beginning of conversation
          </p>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
            {channelId && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-4 py-2.5 border border-border/50">
                  <span className="text-xs text-muted-foreground">Chat ID:</span>
                  <code className="text-xs font-mono text-foreground">{channelId}</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyId}>
                    {copied ? (
                      <Check size={12} className="text-success-foreground" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </Button>
                </div>
                {onSetupWebhook && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5 text-xs"
                    onClick={onSetupWebhook}
                  >
                    <Link size={14} />
                    Setup Webhook
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            messageId={msg.id}
            channelId={channelId}
            senderType={msg.senderType as 'agent' | 'user'}
            senderName={msg.senderType === 'agent' ? agentName : 'You'}
            avatarUrl={msg.senderType === 'agent' ? agentAvatarUrl : null}
            text={msg.text ?? ''}
            createdAt={msg.createdAt}
            status={msg.status as 'info' | 'success' | 'warning' | 'error' | null | undefined}
            review={msg.review}
            metadata={msg.metadata}
            attachments={msg.attachments}
            deliveryStatus={msg.deliveryStatus}
            iterationGroupId={msg.iterationGroupId}
            iteration={msg.iteration}
            iterationTotal={
              msg.iterationGroupId ? iterationTotals.get(msg.iterationGroupId) : undefined
            }
            onReviewRespond={onReviewRespond}
            onReply={onReply}
            onSendAsMessage={onSendAsMessage}
            onRetryDelivery={onRetryDelivery}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
