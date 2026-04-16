'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Copy, Check, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './message-bubble';
import { ShimmerText } from './shimmer-text';
import { useTypewriter } from '@/lib/hooks/use-typewriter';
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
  streamingContent?: string | null;
  progress?: {
    content: string;
    toolHint: boolean;
  } | null;
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
  streamingContent,
  progress,
  onLoadOlder,
  onSetupWebhook,
  onReviewRespond,
  onReply,
  onSendAsMessage,
  onRetryDelivery,
}: MessageListProps) {
  const [copied, setCopied] = useState(false);
  const displayedStreaming = useTypewriter(streamingContent ?? null);

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
  const spacerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);
  const prevLastIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef(0);
  const pinnedUserMessageIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);

  /**
   * Dynamically size the bottom spacer so the user message can be
   * positioned at 40% from top.  Shrinks as response content grows,
   * reaches 0 when content fills the viewport below the user message
   * or when no message is pinned (normal browsing / initial load).
   */
  const updateSpacer = useCallback(() => {
    const container = scrollContainerRef.current;
    const spacer = spacerRef.current;
    const bottom = bottomRef.current;
    if (!container || !spacer || !bottom) return;

    const pinnedId = pinnedUserMessageIdRef.current;
    if (!pinnedId) {
      spacer.style.height = '0px';
      return;
    }

    const userEl = container.querySelector(`[data-message-id="${CSS.escape(pinnedId)}"]`);
    if (!(userEl instanceof HTMLElement)) {
      spacer.style.height = '0px';
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const userRect = userEl.getBoundingClientRect();
    const bottomRect = bottom.getBoundingClientRect();

    // Convert to scroll-content coordinates
    const userTop = userRect.top - containerRect.top + container.scrollTop;
    const contentEnd = bottomRect.top - containerRect.top + container.scrollTop;
    const viewportH = container.clientHeight;

    // For 40% positioning we need: scrollHeight >= userTop + viewportH * 0.6
    const neededScrollHeight = userTop + viewportH * 0.6;
    const spacerHeight = Math.max(0, Math.ceil(neededScrollHeight - contentEnd));
    spacer.style.height = `${spacerHeight}px`;
  }, []);

  const scrollUserMessageIntoView = useCallback(() => {
    const container = scrollContainerRef.current;
    const pinnedId = pinnedUserMessageIdRef.current;
    if (!container || !pinnedId) return;

    const el = container.querySelector(`[data-message-id="${CSS.escape(pinnedId)}"]`);
    if (!(el instanceof HTMLElement)) return;

    // Ensure spacer is sized before scrolling
    updateSpacer();

    // Position the user message roughly 40% from the top — leaves space below
    // for the upcoming response to appear visibly
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elTopInContainer = elRect.top - containerRect.top + container.scrollTop;
    const targetScrollTop = elTopInContainer - container.clientHeight * 0.4;
    container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
  }, [updateSpacer]);

  /**
   * Smart scroll that keeps the user message visible while following growing
   * content (streaming / new agent message).  Once the content grows long
   * enough that the user message can no longer fit, it transitions to
   * regular bottom-following.
   */
  const scrollFollowContent = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const pinnedId = pinnedUserMessageIdRef.current;
    if (!pinnedId) {
      // No pin — just follow bottom
      updateSpacer();
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const userEl = container.querySelector(`[data-message-id="${CSS.escape(pinnedId)}"]`);
    if (!(userEl instanceof HTMLElement)) {
      pinnedUserMessageIdRef.current = null;
      updateSpacer();
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const userRect = userEl.getBoundingClientRect();
    const userTopInContainer = userRect.top - containerRect.top + container.scrollTop;
    const containerH = container.clientHeight;

    // Measure content end at bottomRef (excludes spacer)
    const bottomEl = bottomRef.current;
    const contentEnd = bottomEl
      ? bottomEl.getBoundingClientRect().top - containerRect.top + container.scrollTop
      : container.scrollHeight;
    const contentBelowUser = contentEnd - userTopInContainer;

    if (contentBelowUser <= containerH) {
      // Everything (user msg + response so far) fits in viewport —
      // keep user message at ~40% from top
      updateSpacer();
      const target = userTopInContainer - containerH * 0.4;
      container.scrollTo({ top: Math.max(0, target) });
    } else {
      // Response has grown past one viewport — unpin and follow bottom
      pinnedUserMessageIdRef.current = null;
      updateSpacer();
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updateSpacer]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    const lastId = lastMsg.id;
    const isNewMessage =
      messages.length > prevLengthRef.current || lastId !== prevLastIdRef.current;
    const wasLoadingOlder = prevScrollHeightRef.current > 0;

    if (isNewMessage && !wasLoadingOlder) {
      if (lastMsg.senderType === 'user') {
        // User just sent a message — pin it at ~40% from top so the
        // upcoming response has room to appear below.
        pinnedUserMessageIdRef.current = lastId;
        isAtBottomRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollUserMessageIntoView();
          });
        });
      } else {
        // Agent message arrived — keep pin if we have one so the user
        // message stays visible with the response below it.
        if (isAtBottomRef.current) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollFollowContent();
            });
          });
        }
      }
    }

    prevLengthRef.current = messages.length;
    prevLastIdRef.current = lastId;
  }, [messages, scrollUserMessageIntoView, scrollFollowContent]);

  // Auto-scroll during streaming — follow the growing response while
  // keeping the user message visible as long as it fits in the viewport.
  useEffect(() => {
    if (!displayedStreaming) return;
    if (!isAtBottomRef.current) return;

    requestAnimationFrame(() => {
      scrollFollowContent();
    });
  }, [displayedStreaming, scrollFollowContent]);

  // Auto-scroll when progress/status changes (only when at bottom)
  useEffect(() => {
    if (!progress) return;
    if (!isAtBottomRef.current) return;

    requestAnimationFrame(() => {
      scrollFollowContent();
    });
  }, [progress, scrollFollowContent]);

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

  // Scroll handler: track "at bottom" state + load older messages on scroll-up
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Measure distance to bottomRef (ignores the dynamic spacer) so that
    // auto-scroll keeps working even when the spacer is present.
    const bottom = bottomRef.current;
    if (bottom) {
      const containerRect = container.getBoundingClientRect();
      const bottomRect = bottom.getBoundingClientRect();
      // bottomRect.top - containerRect.bottom: negative when bottomRef is
      // above the viewport bottom edge (i.e. content is scrolled past it)
      const distFromContent = bottomRect.top - containerRect.bottom;
      isAtBottomRef.current = distFromContent < 150;
    } else {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      isAtBottomRef.current = distanceFromBottom < 150;
    }

    if (hasMore && !loadingOlder && onLoadOlder && container.scrollTop < 100) {
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
      <div className="flex flex-col min-h-full p-6 gap-4">
        {/* Push messages to the bottom when there are few */}
        <div className="flex-1" />

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
            <p className="text-base text-muted-foreground">
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

        {/* Streaming: show partial response as it arrives */}
        {displayedStreaming && (
          <MessageBubble
            messageId="__streaming__"
            channelId={channelId}
            senderType="agent"
            senderName={agentName}
            avatarUrl={agentAvatarUrl}
            text={displayedStreaming}
            createdAt={new Date().toISOString()}
            status={null}
            review={null}
            metadata={null}
            attachments={[]}
            deliveryStatus={null}
            iterationGroupId={null}
            iteration={null}
          />
        )}

        {/* Progress/activity indicator */}
        {progress?.content ? (
          <div className="pl-0 sm:pl-11">
            <ShimmerText text={progress.content} className="text-sm font-medium" />
          </div>
        ) : null}

        <div ref={bottomRef} />

        {/* Dynamic bottom spacer — sized by updateSpacer() to allow
            40% positioning when a user message is pinned; 0 otherwise. */}
        <div ref={spacerRef} className="shrink-0" aria-hidden />
      </div>
    </div>
  );
});
