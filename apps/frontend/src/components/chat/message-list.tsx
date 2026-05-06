'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Copy, Check, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './message-bubble';
import { ShimmerText } from './shimmer-text';
import type { ChatMessage } from '@/lib/hooks/use-messages';
import type { MessageStatusEvent } from '@placet/shared';

const QUOTED_REPLY_PREFIX = /^> \*\*.+?:\*\* .+?(?:…)?\n\n[\s\S]*$/;

interface MessageListProps {
  messages: ChatMessage[];
  agentName: string;
  agentAvatarUrl?: string | null;
  channelId?: string;
  loading?: boolean;
  loadingOlder?: boolean;
  hasMore?: boolean;
  highlightMessageId?: string | null;
  orphanStatusByStream?: Record<string, MessageStatusEvent[]>;
  ephemeralProgress?: { content: string; toolHint: boolean } | null;
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
  orphanStatusByStream = {},
  ephemeralProgress,
  onLoadOlder,
  onSetupWebhook,
  onReviewRespond,
  onReply,
  onSendAsMessage,
  onRetryDelivery,
}: MessageListProps) {
  const [copied, setCopied] = useState(false);
  // Track the latest text of any streaming draft (used to drive
  // auto-scroll while the response grows). When no draft is currently
  // streaming this is `null`, which keeps the streaming-only effects
  // from firing.
  const latestStreamingContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].streamState === 'streaming') {
        return messages[i].text ?? '';
      }
    }
    return null;
  }, [messages]);

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
        const isQuotedReply = !!lastMsg.text && QUOTED_REPLY_PREFIX.test(lastMsg.text);

        // Quoted replies should keep normal bottom-follow behavior; otherwise
        // the pinning mode can make older agent messages appear to vanish.
        pinnedUserMessageIdRef.current = isQuotedReply ? null : lastId;
        isAtBottomRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (isQuotedReply) {
              updateSpacer();
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              return;
            }

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
  }, [messages, scrollUserMessageIntoView, scrollFollowContent, updateSpacer]);

  // Auto-scroll during streaming — follow the growing response while
  // keeping the user message visible as long as it fits in the viewport.
  useEffect(() => {
    if (!latestStreamingContent) return;
    if (!isAtBottomRef.current) return;

    requestAnimationFrame(() => {
      scrollFollowContent();
    });
  }, [latestStreamingContent, scrollFollowContent]);

  // Auto-scroll when orphan or ephemeral status changes (only when at bottom)
  const orphanStatusKey = useMemo(
    () =>
      Object.entries(orphanStatusByStream)
        .map(([sid, evs]) => `${sid}:${evs.length}`)
        .join('|'),
    [orphanStatusByStream],
  );
  const ephemeralKey = ephemeralProgress?.content ?? '';
  useEffect(() => {
    if (!orphanStatusKey && !ephemeralKey) return;
    if (!isAtBottomRef.current) return;

    requestAnimationFrame(() => {
      scrollFollowContent();
    });
  }, [orphanStatusKey, ephemeralKey, scrollFollowContent]);

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
      className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
    >
      <div className="flex flex-col min-h-full p-6 gap-4 w-full max-w-4xl mx-auto">
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

        {/* ── Unified timeline ──
            Persisted messages and in-flight streaming bubbles are sorted
            into one timeline keyed by `createdAt`. The streaming bubble
            is anchored at the agent-side stream-start time so a user
            interrupt sent mid-stream stays visually below the streamed
            agent reply. Streaming drafts (`streamState === 'streaming'`)
            are pinned to the bottom of the timeline regardless of their
            createdAt, so a later user message never appears below the
            actively-streaming reply. Live status for a draft is rendered
            inside that bubble below the partial text; if status events
            arrive before the draft message exists, an orphan row is
            rendered at the bottom. */}
        {(() => {
          const parseTime = (value: string | null | undefined): number => {
            if (!value) return Number.POSITIVE_INFINITY;
            const t = new Date(value).getTime();
            return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
          };

          // Sort strictly by `createdAt`. Streaming drafts are pulled to
          // the bottom by the `streamState === 'streaming'` filter below,
          // so we never reorder settled rows when an unrelated update
          // bumps their `updatedAt` (acknowledge, webhook delivery, …).
          const sortKey = (m: ChatMessage) => parseTime(m.createdAt);

          const isStreaming = (m: ChatMessage) => m.streamState === 'streaming';
          const settled = messages
            .filter((m) => !isStreaming(m))
            .slice()
            .sort((a, b) => sortKey(a) - sortKey(b));
          const streamingTail = messages
            .filter(isStreaming)
            .slice()
            .sort((a, b) => sortKey(a) - sortKey(b));

          const renderStatus = (key: string, events: MessageStatusEvent[]) => {
            if (events.length === 0) return null;
            const last = events[events.length - 1];
            return (
              <div key={key} className="pl-0 sm:pl-11">
                <ShimmerText text={last.text} className="text-sm font-medium" />
              </div>
            );
          };

          const renderMessage = (msg: ChatMessage) => (
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
              statusEvents={msg.statusEvents}
              streamState={msg.streamState}
              onReviewRespond={onReviewRespond}
              onReply={onReply}
              onSendAsMessage={onSendAsMessage}
              onRetryDelivery={onRetryDelivery}
            />
          );

          const rendered: React.ReactNode[] = [];
          settled.forEach((m) => rendered.push(renderMessage(m)));
          // Streaming bubbles render their own live-status row inside the
          // bubble (below the partial text); no separate timeline row.
          streamingTail.forEach((m) => rendered.push(renderMessage(m)));
          // Orphan status: events arrived before the draft message — render
          // a standalone shimmer row at the bottom.
          const claimedStreamIds = new Set(
            messages.map((m) => m.streamId).filter((s): s is string => !!s),
          );
          const latestOrphan =
            streamingTail.length === 0
              ? Object.entries(orphanStatusByStream)
                  .filter(
                    ([streamId, events]) => !claimedStreamIds.has(streamId) && events.length > 0,
                  )
                  .sort(([, left], [, right]) => {
                    const a = parseTime(left[left.length - 1]?.createdAt);
                    const b = parseTime(right[right.length - 1]?.createdAt);
                    return b - a;
                  })[0]
              : undefined;
          if (latestOrphan) {
            const [streamId, events] = latestOrphan;
            const status = renderStatus(`__orphan_${streamId}__`, events);
            if (status) rendered.push(status);
          }
          // Ephemeral fallback: shown only when neither a streaming draft
          // nor any persistent orphan status is active for this channel —
          // i.e. agents that emit `message:progress` without opening a
          // streaming draft (non-streaming flows) still surface a live
          // shimmer of "what's being done" until the next message lands.
          const hasPersistentStatus =
            streamingTail.some((m) => (m.statusEvents ?? []).length > 0) || !!latestOrphan;
          if (streamingTail.length === 0 && !hasPersistentStatus && ephemeralProgress?.content) {
            rendered.push(
              <div key="__ephemeral_progress__" className="pl-0 sm:pl-11">
                <ShimmerText text={ephemeralProgress.content} className="text-sm font-medium" />
              </div>,
            );
          }
          return rendered;
        })()}

        <div ref={bottomRef} />

        {/* Dynamic bottom spacer — sized by updateSpacer() to allow
            40% positioning when a user message is pinned; 0 otherwise. */}
        <div ref={spacerRef} className="shrink-0" aria-hidden />
      </div>
    </div>
  );
});
