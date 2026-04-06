'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  Expand,
  FileText,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { ReviewCard } from '@/components/chat/review-card';
import { FilePreviewModal } from '@/components/chat/file-preview-modal';
import { MarkdownContent } from '@/components/chat/markdown-content';
import { FilePreview } from '@/components/files/file-preview';
import { formatRelativeTime, formatTime } from '@/lib/format-date';
import { getFileTypeLabel, formatFileSize } from '@/lib/file-utils';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Attachment, Message, Review } from '@placet/shared';

interface InboxDetailProps {
  message: Message;
  agentName: string;
  agentAvatarUrl?: string | null;
  onRespond: (
    messageId: string,
    response: Record<string, unknown>,
    modifiedFileIds?: Record<string, string>,
    options?: { requestChanges?: boolean; feedback?: string },
  ) => Promise<unknown>;
}

export const InboxDetail = memo(function InboxDetail({
  message,
  agentName,
  agentAvatarUrl,
  onRespond,
}: InboxDetailProps) {
  const router = useRouter();
  const [responded, setResponded] = useState(false);
  const [chainResult, setChainResult] = useState<{ id: string; chain: Message[] } | null>(null);

  // Fetch iteration chain when message has iterations
  useEffect(() => {
    if (!message.iterationGroupId) return;
    let cancelled = false;
    api<{ groupId: string; iterations: Message[] }>(
      `/api/messages/${message.id}/iterations?channel=${message.channelId}`,
    )
      .then((res) => {
        if (!cancelled) setChainResult({ id: message.id, chain: res.iterations });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, message.iterationGroupId, message.channelId]);

  const iterationChain =
    message.iterationGroupId && chainResult?.id === message.id ? chainResult.chain : [];

  const handleRespond = useCallback(
    async (
      messageId: string,
      response: Record<string, unknown>,
      modifiedFileIds?: Record<string, string>,
      options?: { requestChanges?: boolean; feedback?: string },
    ) => {
      await onRespond(messageId, response, modifiedFileIds, options);
      setResponded(true);
      setTimeout(() => {
        router.push('/inbox');
      }, 1200);
    },
    [onRespond, router],
  );

  const review = message.review as Review | null;
  const attachments = (message.attachments ?? []) as Attachment[];
  const [messageExpanded, setMessageExpanded] = useState(true);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  const openFileModal = (att: Attachment) => {
    setPreviewAttachment(att);
    setPreviewModalOpen(true);
  };

  return (
    <div className="flex h-full flex-1 flex-col bg-card rounded-t-3xl lg:rounded-b-3xl overflow-hidden shadow-sm border border-border/50 border-b-0 lg:border-b">
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

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {responded ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-success mb-3" />
            <p className="text-sm font-medium text-foreground">Response submitted</p>
            <p className="text-xs text-muted-foreground mt-1">Returning to inbox…</p>
          </div>
        ) : (
          <>
            {/* ── Iteration timeline ── */}
            {iterationChain.length > 1 && (
              <div className="px-4 py-3">
                <div className="flex justify-center">
                  <div className="overflow-x-auto">
                    <div className="flex items-center gap-0 w-max">
                      {iterationChain.map((iter, idx) => {
                        const rs = (iter.review as Record<string, unknown> | null)?.status as
                          | string
                          | undefined;
                        const isCurrent = iter.id === message.id;
                        const isDone = rs === 'completed' || rs === 'expired';
                        const isChanges = rs === 'changes_requested';
                        const isPending = rs === 'pending';
                        return (
                          <div key={iter.id} className="flex items-center">
                            {idx > 0 && <div className="h-px w-4 shrink-0 bg-border" />}
                            <Link
                              href={`/inbox/${iter.id}`}
                              className="relative flex flex-col items-center gap-1 group"
                              title={`Iteration ${iter.iteration}${rs ? ` — ${rs}` : ''}`}
                            >
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors border',
                                  isCurrent &&
                                    isPending &&
                                    'bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400',
                                  isCurrent &&
                                    isDone &&
                                    'bg-muted border-border text-muted-foreground',
                                  isCurrent &&
                                    isChanges &&
                                    'bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-400',
                                  isCurrent &&
                                    !rs &&
                                    'bg-primary/10 border-primary/30 text-primary',
                                  !isCurrent &&
                                    'border-border/60 text-muted-foreground hover:bg-muted hover:border-border',
                                )}
                              >
                                <span className="font-mono">{iter.iteration}</span>
                                {rs === 'completed' && (
                                  <Check size={11} className="text-muted-foreground" />
                                )}
                                {rs === 'changes_requested' && (
                                  <RotateCw
                                    size={11}
                                    className={
                                      isCurrent
                                        ? 'text-orange-600 dark:text-orange-400'
                                        : 'text-muted-foreground'
                                    }
                                  />
                                )}
                                {rs === 'expired' && (
                                  <XCircle size={11} className="text-muted-foreground" />
                                )}
                                {rs === 'pending' && (
                                  <Circle
                                    size={9}
                                    className={cn(
                                      'fill-current',
                                      isCurrent ? 'text-yellow-500' : 'text-muted-foreground/50',
                                    )}
                                  />
                                )}
                              </span>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Message content (collapsible) ── */}
            {message.text && (
              <div className="border-b border-border/50">
                <button
                  type="button"
                  onClick={() => setMessageExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <span>Message</span>
                  {messageExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {messageExpanded && (
                  <div className="px-4 pb-3">
                    <div className="text-sm leading-relaxed">
                      <MarkdownContent content={message.text} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Attached files ── */}
            {attachments.length > 0 && (
              <div className="flex-1">
                {/* File tabs if multiple */}
                {attachments.length > 1 && (
                  <div className="flex items-center gap-1 px-4 pt-3 pb-1 overflow-x-auto">
                    {attachments.map((att, i) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => setActiveFileIdx(i)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors shrink-0',
                          i === activeFileIdx
                            ? 'bg-muted text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                        )}
                      >
                        <FileText size={12} />
                        <span className="truncate max-w-[120px]">{att.filename}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* File preview — inline on desktop, compact card on mobile */}
                {(() => {
                  const att = attachments[activeFileIdx];
                  if (!att) return null;
                  return (
                    <div className="px-4 py-3">
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={14} className="text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate">{att.filename}</span>
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                              {getFileTypeLabel(att.mimeType, att.filename)} ·{' '}
                              {formatFileSize(att.size)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/files/${att.id}/download`}
                              download={att.filename}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
                            >
                              Download
                            </a>
                            <button
                              type="button"
                              onClick={() => openFileModal(att)}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Expand size={13} />
                              <span className="hidden sm:inline">Fullscreen</span>
                            </button>
                          </div>
                        </div>
                        {/* Inline preview — scrolls with content */}
                        <div className="min-h-[300px]">
                          <FilePreview
                            fileId={att.id}
                            mimeType={att.mimeType}
                            filename={att.filename}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Sticky review card at bottom ── */}
      {review && !responded && (
        <div className="shrink-0 border-t border-border/50 bg-card p-4">
          <ReviewCard review={review} messageId={message.id} onRespond={handleRespond} />
        </div>
      )}

      {/* ── Fullscreen file preview modal ── */}
      <FilePreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        attachment={previewAttachment}
        attachments={attachments}
        channelId={message.channelId}
        messageText={message.text}
        review={review}
        messageId={message.id}
        iterationGroupId={message.iterationGroupId}
        iteration={message.iteration}
        onReviewRespond={handleRespond}
      />
    </div>
  );
});
