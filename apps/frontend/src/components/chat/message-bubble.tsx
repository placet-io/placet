'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Reply, Check, CheckCheck, ChevronDown, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { PluginRenderer } from '@/components/plugins/plugin-renderer';
import { ReviewCard } from './review-card';
import { MarkdownContent } from './markdown-content';
import { MessageAttachments } from './message-attachments';
import { FilePreviewModal } from './file-preview-modal';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format-date';
import type { Attachment, DeliveryStatus, Review } from '@placet/shared';
import type { PluginAttachmentInfo, PluginReviewContext } from '@placet/shared';

interface MessageBubbleProps {
  messageId: string;
  channelId?: string;
  senderType: 'agent' | 'user';
  senderName: string;
  avatarUrl?: string | null;
  text: string;
  createdAt: string;
  status?: 'info' | 'success' | 'warning' | 'error' | null;
  review?: Review | null;
  metadata?: Record<string, unknown> | null;
  attachments?: Attachment[];
  deliveryStatus?: DeliveryStatus | null;
  iterationGroupId?: string | null;
  iteration?: number | null;
  iterationTotal?: number;
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

const STATUS_VARIANT = {
  info: 'outline' as const,
  success: 'default' as const,
  warning: 'secondary' as const,
  error: 'destructive' as const,
};

const SWIPE_THRESHOLD = 60;
const USER_MSG_COLLAPSE_CHARS = 500;

export const MessageBubble = memo(function MessageBubble({
  messageId,
  channelId,
  senderType,
  senderName,
  avatarUrl,
  text,
  createdAt,
  status,
  review,
  metadata,
  attachments = [],
  deliveryStatus,
  iterationGroupId,
  iteration,
  iterationTotal,
  onReviewRespond,
  onReply,
  onSendAsMessage,
  onRetryDelivery,
}: MessageBubbleProps) {
  const isUser = senderType === 'user';
  const time = formatTime(createdAt);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [pluginPreviewOpen, setPluginPreviewOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasAttachments = attachments.length > 0;
  const pluginName = typeof metadata?.plugin === 'string' ? metadata.plugin : null;

  // Parse quote block from message text: "> **Name:** text\n\nactual message"
  const quoteMatch = text?.match(/^> \*\*(.+?):\*\* (.+?)(?:…)?\n\n([\s\S]*)$/);
  const quotedName = quoteMatch?.[1] ?? null;
  const quotedText = quoteMatch?.[2] ?? null;
  const bodyText = quoteMatch ? quoteMatch[3] : text;
  const hasText = bodyText && bodyText.trim().length > 0;
  const swipeRef = useRef<HTMLDivElement>(null);
  const replyIconRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef(false);
  const directionLockedRef = useRef(false);
  const lastDeltaRef = useRef(0);

  const handlePreview = useCallback((att: Attachment) => {
    setPreviewAttachment(att);
  }, []);

  /** Preview handler for inline storage media in markdown (images/videos by file ID) */
  const handleFilePreview = useCallback(
    (fileId: string) => {
      // Fetch HEAD to get content-type and filename for the preview modal
      fetch(`/api/files/${fileId}/download`, { method: 'HEAD', credentials: 'include' })
        .then((res) => {
          const ct = res.headers.get('content-type') ?? 'application/octet-stream';
          const disp = res.headers.get('content-disposition') ?? '';
          const fnMatch = disp.match(/filename="?(.+?)"?(?:;|$)/);
          const filename = fnMatch?.[1] ?? fileId;
          const cl = res.headers.get('content-length');
          const att: Attachment = {
            id: fileId,
            messageId: messageId,
            channelId: channelId ?? '',
            pluginType: '',
            filename,
            mimeType: ct,
            size: cl ? parseInt(cl, 10) : 0,
            storageKey: '',
            createdAt: createdAt,
          };
          setPreviewAttachment(att);
        })
        .catch(() => {
          // Fallback: open as image
          const att: Attachment = {
            id: fileId,
            messageId: messageId,
            channelId: channelId ?? '',
            pluginType: '',
            filename: fileId,
            mimeType: 'image/png',
            size: 0,
            storageKey: '',
            createdAt: createdAt,
          };
          setPreviewAttachment(att);
        });
    },
    [messageId, channelId, createdAt],
  );

  const handleClosePreview = useCallback((open: boolean) => {
    if (!open) setPreviewAttachment(null);
  }, []);

  const handleReply = useCallback(() => {
    onReply?.(messageId, senderName, text);
  }, [messageId, senderName, text, onReply]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
  }, [text]);

  const handlePluginReviewRespond = useCallback(
    async (response: Record<string, unknown>) => {
      await onReviewRespond?.(messageId, response);
    },
    [messageId, onReviewRespond],
  );

  // Build plugin data — everything in metadata except "plugin" key
  const pluginData =
    pluginName && metadata
      ? Object.fromEntries(Object.entries(metadata).filter(([k]) => k !== 'plugin'))
      : {};

  // Map Attachment[] to PluginAttachmentInfo[]
  const pluginAttachments: PluginAttachmentInfo[] = attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
  }));

  // Build review context for plugin
  const pluginReview: PluginReviewContext | null = review
    ? {
        type: review.type,
        status: review.status,
        payload: review.payload as Record<string, unknown> | undefined,
      }
    : null;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!onReply) return;
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      isSwipingRef.current = false;
      directionLockedRef.current = false;
      lastDeltaRef.current = 0;
      if (swipeRef.current) swipeRef.current.style.transition = 'none';
      if (replyIconRef.current) replyIconRef.current.style.transition = 'none';
    },
    [onReply],
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    const metThreshold = lastDeltaRef.current >= SWIPE_THRESHOLD;

    if (swipeRef.current) {
      swipeRef.current.style.transition = 'transform 0.2s ease-out';
      swipeRef.current.style.transform = '';
    }
    if (replyIconRef.current) {
      replyIconRef.current.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
      replyIconRef.current.style.opacity = '0';
      replyIconRef.current.style.transform = 'translateY(-50%) scale(0.5)';
    }

    touchStartRef.current = null;
    lastDeltaRef.current = 0;
    if (metThreshold) handleReply();
  }, [handleReply]);

  useEffect(() => {
    const el = swipeRef.current;
    if (!el || !onReply) return;

    const handler = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      if (!directionLockedRef.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
        directionLockedRef.current = true;
        isSwipingRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
      if (!isSwipingRef.current) return;
      e.preventDefault();

      const clampedDelta = Math.max(0, Math.min(deltaX, 100));
      lastDeltaRef.current = clampedDelta;

      if (swipeRef.current) {
        swipeRef.current.style.transform = `translateX(${clampedDelta}px)`;
      }
      if (replyIconRef.current) {
        const progress = Math.min(clampedDelta / SWIPE_THRESHOLD, 1);
        replyIconRef.current.style.opacity = String(progress);
        replyIconRef.current.style.transform = `translateY(-50%) scale(${0.5 + progress * 0.5})`;
      }
    };

    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, [onReply]);

  return (
    <>
      <div className="overflow-x-clip" data-message-id={messageId}>
        <div
          ref={swipeRef}
          className={cn(
            'group/msg flex gap-3 max-w-[92%] sm:max-w-[80%] relative',
            isUser && 'ml-auto flex-row-reverse',
          )}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {onReply && (
            <div
              ref={replyIconRef}
              className="absolute -left-8 top-1/2 opacity-0 text-muted-foreground sm:hidden pointer-events-none"
              style={{ transform: 'translateY(-50%) scale(0.5)' }}
            >
              <Reply size={18} />
            </div>
          )}
          {!isUser && (
            <div className="hidden sm:block w-8 h-8 shrink-0 mt-0.5">
              <AgentAvatar name={senderName} avatarUrl={avatarUrl} size="sm" />
            </div>
          )}

          <div className={cn('flex flex-col min-w-0', isUser ? 'items-end' : 'items-start')}>
            {!isUser && (status || (iterationGroupId && iteration != null)) && (
              <div className="flex items-center gap-2 mb-1 ml-1">
                {status && (
                  <Badge variant={STATUS_VARIANT[status]} className="text-xs h-4 px-1.5">
                    {status}
                  </Badge>
                )}
                {iterationGroupId && iteration != null && (
                  <Badge
                    variant="outline"
                    className="text-xs h-4 px-1.5 font-mono text-muted-foreground"
                  >
                    Iteration {iteration}
                    {iterationTotal ? `/${iterationTotal}` : ''}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex items-start gap-1 max-w-full">
              <div
                className={cn(
                  'px-4 py-2.5 rounded-2xl text-base leading-relaxed min-w-0 break-words',
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted text-foreground rounded-tl-sm',
                  review && 'md:min-w-[360px] lg:min-w-[420px] xl:min-w-[480px]',
                )}
              >
                {quotedName && quotedText && (
                  <div
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 mb-1.5 border-l-2',
                      isUser
                        ? 'bg-primary-foreground/15 border-primary-foreground/40'
                        : 'bg-background/60 border-primary/40',
                    )}
                  >
                    <p
                      className={cn(
                        'text-xs font-semibold',
                        isUser ? 'text-primary-foreground/80' : 'text-primary',
                      )}
                    >
                      {quotedName}
                    </p>
                    <p
                      className={cn(
                        'text-xs truncate',
                        isUser ? 'text-primary-foreground/70' : 'text-muted-foreground',
                      )}
                    >
                      {quotedText}
                    </p>
                  </div>
                )}
                {hasText && (
                  <>
                    {isUser && !expanded && bodyText.length > USER_MSG_COLLAPSE_CHARS ? (
                      <div>
                        <div className="relative">
                          <div className="overflow-hidden max-h-24">
                            <MarkdownContent
                              content={bodyText}
                              onFilePreview={handleFilePreview}
                              isUser={isUser}
                            />
                          </div>
                          <div className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-primary to-transparent pointer-events-none" />
                        </div>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-primary-foreground/80 hover:text-primary-foreground mt-1"
                          onClick={() => setExpanded(true)}
                        >
                          <ChevronDown size={12} />
                          Show more
                        </button>
                      </div>
                    ) : (
                      <MarkdownContent
                        content={bodyText}
                        onFilePreview={handleFilePreview}
                        isUser={isUser}
                      />
                    )}
                  </>
                )}

                {hasAttachments && (
                  <MessageAttachments attachments={attachments} onPreview={handlePreview} />
                )}

                {pluginName && (
                  <div className="relative group/plugin">
                    <PluginRenderer
                      pluginName={pluginName}
                      data={pluginData}
                      attachments={pluginAttachments}
                      message={{
                        id: messageId,
                        channelId: channelId ?? '',
                        senderType,
                        createdAt,
                      }}
                      review={pluginReview}
                      onReviewRespond={onReviewRespond ? handlePluginReviewRespond : undefined}
                      className="mt-2 -mx-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1 right-1 opacity-0 group-hover/plugin:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm hover:bg-background"
                      onClick={() => setPluginPreviewOpen(true)}
                      title="Open in preview"
                    >
                      <Maximize2 size={12} />
                    </Button>
                  </div>
                )}

                {review && onReviewRespond && !pluginName && (
                  <ReviewCard
                    review={review}
                    messageId={messageId}
                    deliveryStatus={deliveryStatus}
                    onRespond={onReviewRespond}
                    onRetryDelivery={onRetryDelivery}
                  />
                )}
              </div>
            </div>

            <div className={cn('flex items-center gap-1 mt-1', isUser ? 'mr-1' : 'ml-1')}>
              {isUser && (
                <div className="hidden group-hover/msg:flex items-center gap-0.5">
                  {onReply && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      onClick={handleReply}
                    >
                      <Reply size={12} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    onClick={handleCopy}
                    title="Copy message"
                  >
                    <Copy size={12} />
                  </Button>
                </div>
              )}
              <span className="text-xs text-muted-foreground">{time}</span>
              {!isUser && (
                <div className="hidden group-hover/msg:flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    onClick={handleCopy}
                    title="Copy message"
                  >
                    <Copy size={12} />
                  </Button>
                  {onReply && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      onClick={handleReply}
                    >
                      <Reply size={12} />
                    </Button>
                  )}
                </div>
              )}
              {isUser && deliveryStatus && (
                <span
                  className={cn(
                    'inline-flex',
                    deliveryStatus === 'agent_received'
                      ? 'text-blue-500'
                      : deliveryStatus === 'webhook_failed'
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                  )}
                  title={
                    deliveryStatus === 'sent'
                      ? 'Sent'
                      : deliveryStatus === 'webhook_delivered'
                        ? 'Delivered to agent'
                        : deliveryStatus === 'agent_received'
                          ? 'Acknowledged by agent'
                          : 'Delivery failed'
                  }
                >
                  {deliveryStatus === 'sent' && <Check size={12} />}
                  {deliveryStatus === 'webhook_delivered' && <CheckCheck size={12} />}
                  {deliveryStatus === 'agent_received' && <CheckCheck size={12} />}
                  {deliveryStatus === 'webhook_failed' && <Check size={12} />}
                </span>
              )}
              {isUser && status && (
                <Badge variant={STATUS_VARIANT[status]} className="text-xs h-4 px-1.5">
                  {status}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      {(hasAttachments || previewAttachment !== null) && (
        <FilePreviewModal
          open={previewAttachment !== null}
          onOpenChange={handleClosePreview}
          attachment={previewAttachment}
          attachments={
            previewAttachment
              ? [previewAttachment, ...attachments.filter((a) => a.id !== previewAttachment.id)]
              : attachments
          }
          channelId={channelId}
          messageText={text}
          review={review}
          messageId={messageId}
          iterationGroupId={iterationGroupId}
          iteration={iteration}
          onReviewRespond={onReviewRespond}
          onSendAsMessage={onSendAsMessage}
        />
      )}

      {/* Plugin Preview Modal */}
      {pluginName && (
        <FilePreviewModal
          open={pluginPreviewOpen}
          onOpenChange={setPluginPreviewOpen}
          attachment={null}
          attachments={[]}
          messageText={text}
          review={review}
          messageId={messageId}
          iterationGroupId={iterationGroupId}
          iteration={iteration}
          onReviewRespond={onReviewRespond}
          plugin={{
            name: pluginName,
            data: pluginData,
            attachments: pluginAttachments,
            message: {
              id: messageId,
              channelId: channelId ?? '',
              senderType,
              createdAt,
            },
            review: pluginReview,
            onReviewRespond: onReviewRespond ? handlePluginReviewRespond : undefined,
          }}
        />
      )}
    </>
  );
});
