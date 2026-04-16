'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Pen,
  RotateCcw,
  Send,
  ArrowLeftRight,
  Check,
  Circle,
  XCircle,
} from 'lucide-react';
import { useAnnotations } from '@/lib/hooks/use-annotations';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Dialog, DialogClose, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ReviewCard } from './review-card';
import { computeTextDiff, hasChanges, type DiffLine } from '@/lib/diff-utils';
import { MarkdownContent } from './markdown-content';
import { FilePreview } from '@/components/files/file-preview';
import { CanvasOverlay } from './canvas-overlay';
import { PluginRenderer } from '@/components/plugins/plugin-renderer';
import { formatFileSize, getFileTypeLabel } from '@/lib/file-utils';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Attachment, Message, Review } from '@placet/shared';
import type { PluginAttachmentInfo, PluginReviewContext } from '@placet/shared';
import type { CanvasOverlayHandle } from './canvas-overlay';

/** Check if a MIME type represents diffable text content */
function isDiffableMime(mimeType: string): boolean {
  return (
    mimeType === 'text/markdown' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/html' ||
    mimeType.startsWith('text/')
  );
}

/** Hook: fetch text content from a file attachment for diffing */
function useFileText(fileId: string | null): string | null {
  const [result, setResult] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    fetch(`/api/files/${fileId}/download`, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setResult({ id: fileId, text: t });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  return fileId && result?.id === fileId ? result.text : null;
}

interface FilePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachment: Attachment | null;
  /** All attachments in the message (for nav between files) */
  attachments: Attachment[];
  /** Channel ID for file uploads */
  channelId?: string;
  /** Message text for context */
  messageText?: string | null;
  /** Review bound to this message */
  review?: Review | null;
  messageId: string;
  /** Iteration group ID for fetching the iteration chain */
  iterationGroupId?: string | null;
  /** Current iteration number */
  iteration?: number | null;
  onReviewRespond?: (
    messageId: string,
    response: Record<string, unknown>,
    modifiedFileIds?: Record<string, string>,
    options?: { feedback?: string },
  ) => Promise<void>;
  onSendAsMessage?: (attachmentId: string) => Promise<void>;
  /** Plugin info for rendering plugin in preview mode */
  plugin?: {
    name: string;
    data: Record<string, unknown>;
    attachments: PluginAttachmentInfo[];
    message: { id: string; channelId: string; senderType: string; createdAt: string };
    review: PluginReviewContext | null;
    onReviewRespond?: (response: Record<string, unknown>) => Promise<void>;
  } | null;
}

export const FilePreviewModal = memo(function FilePreviewModal({
  open,
  onOpenChange,
  attachment,
  attachments,
  channelId,
  messageText,
  review,
  messageId,
  iterationGroupId,
  iteration,
  onReviewRespond,
  onSendAsMessage,
  plugin,
}: FilePreviewModalProps) {
  const { annotations, saveAnnotation, revertAnnotation } = useAnnotations();
  const [currentIndex, setCurrentIndex] = useState(() =>
    attachment ? attachments.findIndex((a) => a.id === attachment.id) : 0,
  );
  const [annotating, setAnnotating] = useState(false);
  const [annoSaving, setAnnoSaving] = useState(false);
  const [sendingAsMsg, setSendingAsMsg] = useState(false);
  const [viewingAnnotated, setViewingAnnotated] = useState(false);
  const canvasRef = useRef<CanvasOverlayHandle>(null);

  // Iteration chain state
  const [iterationChain, setIterationChain] = useState<Message[]>([]);
  const [activeIteration, setActiveIteration] = useState<number | null>(null);

  // Fetch iteration chain when modal opens and message has iterations
  useEffect(() => {
    if (!open || !iterationGroupId || !messageId) {
      setIterationChain([]);
      setActiveIteration(null);
      return;
    }
    let cancelled = false;
    api<{ groupId: string; iterations: Message[] }>(
      `/api/messages/${messageId}/iterations?channel=${channelId}`,
    )
      .then((res) => {
        if (!cancelled) {
          setIterationChain(res.iterations);
          setActiveIteration(iteration ?? null);
        }
      })
      .catch(() => {
        // Non-critical — iteration breadcrumbs simply won't show
      });
    return () => {
      cancelled = true;
    };
  }, [open, iterationGroupId, messageId, iteration, channelId]);

  // The active iteration's message (or the current message if no chain)
  const activeIterMsg =
    activeIteration != null
      ? iterationChain.find((m) => m.iteration === activeIteration)
      : undefined;

  // Use the active iteration's attachments and text when viewing a different iteration
  const effectiveAttachments =
    activeIterMsg && activeIterMsg.id !== messageId
      ? ((activeIterMsg.attachments ?? []) as Attachment[])
      : attachments;
  const effectiveMessageText =
    activeIterMsg && activeIterMsg.id !== messageId ? (activeIterMsg.text ?? null) : messageText;
  const effectiveReview =
    activeIterMsg && activeIterMsg.id !== messageId
      ? (activeIterMsg.review as Review | null | undefined)
      : review;
  const effectiveMessageId =
    activeIterMsg && activeIterMsg.id !== messageId ? activeIterMsg.id : messageId;

  // The previous iteration message (for diff / feedback)
  const prevIteration =
    activeIteration != null && activeIteration > 1
      ? iterationChain.find((m) => m.iteration === activeIteration - 1)
      : undefined;

  // ── Compare mode state ──
  const [compareToIteration, setCompareToIteration] = useState<number | null>(null);

  // Reset currentIndex when active iteration changes
  useEffect(() => {
    setCurrentIndex(0);
    setAnnotating(false);
    setCompareToIteration(null);
  }, [activeIteration]);

  // Sync currentIndex whenever the attachment prop changes.
  useEffect(() => {
    if (attachment) {
      const idx = attachments.findIndex((a) => a.id === attachment.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
    setAnnotating(false);
    setCompareToIteration(null);
  }, [attachment, attachments]);

  // Auto-show the annotated version when navigating to a file that has one.
  useEffect(() => {
    setViewingAnnotated(!!annotations[current?.id ?? '']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, annotations]);

  const current = effectiveAttachments[currentIndex] ?? attachment;
  const annotation = current ? annotations[current.id] : undefined;
  const isPluginOnly = !!plugin && !current;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < effectiveAttachments.length - 1;
  const isImage = current?.mimeType.startsWith('image/') ?? false;
  const canAnnotate = isImage;
  const isDiffable = current ? isDiffableMime(current.mimeType) : false;
  const label = current ? getFileTypeLabel(current.mimeType, current.filename) : '';
  const size = current ? formatFileSize(current.size) : '';

  // ── Compare mode: find the matching file in the comparison iteration ──
  const compareIterMsg =
    compareToIteration != null
      ? iterationChain.find((m) => m.iteration === compareToIteration)
      : undefined;
  const compareAttachment = useMemo(() => {
    if (!compareIterMsg || !current || !isDiffable) return null;
    const atts = (compareIterMsg.attachments ?? []) as Attachment[];
    return atts.find((a) => a.filename === current.filename && isDiffableMime(a.mimeType)) ?? null;
  }, [compareIterMsg, current, isDiffable]);

  const compareOldText = useFileText(compareAttachment?.id ?? null);
  const compareNewText = useFileText(
    compareToIteration != null && isDiffable && current ? current.id : null,
  );

  const compareDiffLines = useMemo<DiffLine[]>(() => {
    if (!compareOldText || !compareNewText) return [];
    if (!hasChanges(compareOldText, compareNewText)) return [];
    return computeTextDiff(compareOldText, compareNewText);
  }, [compareOldText, compareNewText]);

  const isComparing = compareToIteration != null && compareDiffLines.length > 0;
  const isCompareLoading =
    compareToIteration != null &&
    !isComparing &&
    (compareOldText == null || compareNewText == null);

  // Iterations available for comparison (all except the active one)
  const compareOptions = useMemo(() => {
    if (!isDiffable || iterationChain.length < 2 || activeIteration == null) return [];
    return iterationChain
      .filter((m) => m.iteration !== activeIteration)
      .sort((a, b) => (b.iteration ?? 0) - (a.iteration ?? 0));
  }, [isDiffable, iterationChain, activeIteration]);

  const handlePrev = useCallback(() => {
    if (hasPrev) setCurrentIndex((i) => i - 1);
  }, [hasPrev]);

  const handleNext = useCallback(() => {
    if (hasNext) setCurrentIndex((i) => i + 1);
  }, [hasNext]);

  const handleDownload = useCallback(() => {
    if (!current) return;
    const a = document.createElement('a');
    a.href = `/api/files/${current.id}/download`;
    a.download = current.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [current]);

  /**
   * Uploads the annotated canvas as a new file and persists the mapping in
   * localStorage so the annotated version appears in the chat thumbnail and
   * can be toggled in the preview. Decoupled from review responses.
   */
  const handleAnnotationSave = useCallback(async () => {
    if (!current || !canvasRef.current) return;
    try {
      setAnnoSaving(true);
      const blob = await canvasRef.current.exportBlob();
      if (!blob) return;

      const formData = new FormData();
      const annotatedFilename = `annotated-${current.filename}`;
      if (channelId) formData.append('channelId', channelId);
      formData.append('file', blob, annotatedFilename);

      const res = await fetch('/api/files/store', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = (await res.json()) as { id: string };

      saveAnnotation(current.id, data.id, annotatedFilename);
      setAnnotating(false);
    } catch (err) {
      console.error('Annotation save error:', err);
    } finally {
      setAnnoSaving(false);
    }
  }, [channelId, current, saveAnnotation]);

  const handleSendAsMessage = useCallback(async () => {
    if (!current || !onSendAsMessage) return;
    const anno = annotations[current.id];
    if (!anno) return;
    try {
      setSendingAsMsg(true);
      await onSendAsMessage(anno.fileId);
    } catch (err) {
      console.error('Send as message error:', err);
    } finally {
      setSendingAsMsg(false);
    }
  }, [current, annotations, onSendAsMessage]);

  if (!current && !isPluginOnly) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed inset-4 z-50 flex rounded-2xl bg-background ring-1 ring-foreground/10 overflow-hidden outline-none animate-in fade-in-0 zoom-in-95">
          {/* ── Left: File Viewer ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <DialogClose
                  render={<Button variant="ghost" size="icon-sm" className="shrink-0" />}
                >
                  <X size={16} />
                </DialogClose>
                {/* Hide filename on small screens to avoid overflow */}
                <span className="hidden sm:block text-sm font-medium truncate max-w-48 lg:max-w-72">
                  {isPluginOnly ? plugin!.name : current!.filename}
                </span>
                {/* Mobile iteration selector — only visible below lg */}
                {iterationChain.length > 1 && (
                  <div className="lg:hidden shrink-0">
                    <Select
                      value={String(activeIteration ?? '')}
                      onValueChange={(v) => setActiveIteration(Number(v))}
                    >
                      <SelectTrigger size="sm" className="text-xs h-7 gap-1 w-auto">
                        <SelectValue placeholder="Rev" />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {iterationChain.map((iter) => {
                          const rs = iter.review?.status;
                          return (
                            <SelectItem key={iter.id} value={String(iter.iteration ?? 0)}>
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span>Rev {iter.iteration}</span>
                                {rs === 'completed' && (
                                  <Check size={10} className="text-muted-foreground" />
                                )}
                                {rs === 'expired' && (
                                  <XCircle size={10} className="text-muted-foreground" />
                                )}
                                {rs === 'pending' && (
                                  <Circle
                                    size={8}
                                    className="fill-muted-foreground text-muted-foreground"
                                  />
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {!isPluginOnly && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Compare to previous iteration — only for diffable text files */}
                  {compareOptions.length > 0 &&
                    !annotating &&
                    (compareToIteration != null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs rounded-lg"
                        onClick={() => setCompareToIteration(null)}
                      >
                        <ArrowLeftRight size={12} />
                        Exit compare
                      </Button>
                    ) : (
                      <div className="relative">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs rounded-lg peer"
                          onClick={() => {
                            // Default: compare to iteration immediately before
                            const prev = compareOptions.find(
                              (m) => m.iteration === (activeIteration ?? 0) - 1,
                            );
                            setCompareToIteration(
                              prev?.iteration ?? compareOptions[0]?.iteration ?? null,
                            );
                          }}
                        >
                          <ArrowLeftRight size={12} />
                          Compare
                        </Button>
                      </div>
                    ))}
                  {/* Annotation controls */}
                  {canAnnotate && !annotating && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs rounded-lg"
                      onClick={() => setAnnotating(true)}
                    >
                      <Pen size={12} />
                      Annotate
                    </Button>
                  )}
                  {annotating && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs rounded-lg"
                        onClick={() => setAnnotating(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs rounded-lg"
                        disabled={annoSaving}
                        onClick={handleAnnotationSave}
                      >
                        {annoSaving ? 'Saving…' : 'Save Annotation'}
                      </Button>
                    </div>
                  )}
                  {/* Revert button — only when annotation exists and not in draw mode */}
                  {annotation && !annotating && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Remove annotation"
                      onClick={() => revertAnnotation(current!.id)}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                  {/* Send annotation as user message */}
                  {annotation && !annotating && onSendAsMessage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs rounded-lg"
                      disabled={sendingAsMsg}
                      onClick={handleSendAsMessage}
                    >
                      <Send size={12} />
                      {sendingAsMsg ? 'Sending…' : 'Send as message'}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={handleDownload}>
                    <Download size={16} />
                  </Button>
                </div>
              )}
            </div>

            {/* Viewer */}
            <div
              className={cn(
                'flex-1 flex items-center justify-center relative overflow-auto bg-muted/20',
                isPluginOnly ? '' : isComparing || isCompareLoading ? '' : 'p-4',
              )}
            >
              {isPluginOnly ? (
                <PluginRenderer
                  pluginName={plugin!.name}
                  data={plugin!.data}
                  attachments={plugin!.attachments}
                  message={plugin!.message}
                  review={plugin!.review}
                  isPreview
                  onReviewRespond={plugin!.onReviewRespond}
                  className="w-full h-full"
                />
              ) : isComparing ? (
                /* ── Inline diff view ── */
                <div className="w-full h-full flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-muted/30 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      Comparing Iteration {compareToIteration} → {activeIteration}
                    </span>
                    {compareOptions.length > 1 && (
                      <select
                        value={compareToIteration ?? ''}
                        onChange={(e) => setCompareToIteration(Number(e.target.value))}
                        className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
                      >
                        {compareOptions.map((m) => (
                          <option key={m.id} value={m.iteration ?? 0}>
                            Iteration {m.iteration}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto text-xs font-mono">
                    {compareDiffLines.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          'px-4 py-0.5 whitespace-pre-wrap wrap-break-word',
                          line.type === 'added' &&
                            'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                          line.type === 'removed' &&
                            'bg-red-500/10 text-red-700 dark:text-red-400 line-through',
                        )}
                      >
                        <span className="select-none mr-3 text-muted-foreground/60 inline-block w-3">
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
                        </span>
                        {line.value || '\u00A0'}
                      </div>
                    ))}
                  </div>
                </div>
              ) : isCompareLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  Loading comparison…
                </div>
              ) : annotating && isImage ? (
                <CanvasOverlay ref={canvasRef} imageSrc={`/api/files/${current!.id}/download`} />
              ) : (
                <FilePreview
                  fileId={annotation && viewingAnnotated ? annotation.fileId : current!.id}
                  mimeType={current!.mimeType}
                  filename={
                    annotation && viewingAnnotated ? annotation.filename : current!.filename
                  }
                  className="h-full"
                />
              )}
            </div>

            {/* Bottom bar: file navigation and/or original ↔ annotated toggle */}
            {!isPluginOnly && (effectiveAttachments.length > 1 || (annotation && !annotating)) && (
              <div className="flex items-center justify-center gap-3 py-2 border-t border-border/50 flex-wrap">
                {effectiveAttachments.length > 1 && (
                  <>
                    <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={handlePrev}>
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {currentIndex + 1} / {effectiveAttachments.length}
                    </span>
                    <Button variant="ghost" size="icon-sm" disabled={!hasNext} onClick={handleNext}>
                      <ChevronRight size={16} />
                    </Button>
                  </>
                )}
                {annotation && !annotating && (
                  <>
                    {effectiveAttachments.length > 1 && (
                      <span className="text-muted-foreground/30 select-none">|</span>
                    )}
                    <div className="flex bg-muted rounded-full p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setViewingAnnotated(false)}
                        className={cn(
                          'px-3 py-1 rounded-full transition-colors',
                          !viewingAnnotated
                            ? 'bg-background shadow-sm font-medium text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        Original
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingAnnotated(true)}
                        className={cn(
                          'px-3 py-1 rounded-full transition-colors',
                          viewingAnnotated
                            ? 'bg-background shadow-sm font-medium text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        Annotated
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Context Panel (hidden below lg) ── */}
          <div className="hidden lg:flex w-80 border-l border-border/50 flex-col overflow-hidden shrink-0">
            {/* File / Plugin info */}
            <div className="px-4 py-3 border-b border-border/50 space-y-1">
              {isPluginOnly ? (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Plugin</p>
                  <p className="text-sm font-medium truncate">{plugin!.name}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium truncate">{current!.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {label} · {size}
                  </p>
                </>
              )}
            </div>

            {/* Iteration timeline */}
            {iterationChain.length > 1 && (
              <div className="px-4 py-3 border-b border-border/50 space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Iterations</p>
                <div className="overflow-x-auto -mx-1 px-1">
                  <div className="flex items-center gap-0 w-max">
                    {iterationChain.map((iter, idx) => {
                      const reviewStatus = iter.review?.status;
                      const isActive = iter.iteration === activeIteration;
                      const isDone = reviewStatus === 'completed' || reviewStatus === 'expired';
                      const isPending = reviewStatus === 'pending';
                      return (
                        <div key={iter.id} className="flex items-center">
                          {/* Connector line */}
                          {idx > 0 && (
                            <div
                              className={cn(
                                'h-px w-4 shrink-0',
                                isDone ? 'bg-border' : 'bg-border',
                              )}
                            />
                          )}
                          {/* Timeline node */}
                          <button
                            type="button"
                            onClick={() => setActiveIteration(iter.iteration ?? null)}
                            className={cn('relative flex flex-col items-center gap-1 group')}
                            title={`Iteration ${iter.iteration}${reviewStatus ? ` — ${reviewStatus}` : ''}`}
                          >
                            {/* Badge with number + icon */}
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors border',
                                isActive &&
                                  isPending &&
                                  'bg-primary/10 border-primary/30 text-primary',
                                isActive &&
                                  isDone &&
                                  'bg-muted border-border text-muted-foreground',
                                isActive &&
                                  !reviewStatus &&
                                  'bg-primary/10 border-primary/30 text-primary',
                                !isActive &&
                                  'border-border/60 text-muted-foreground hover:bg-muted hover:border-border',
                              )}
                            >
                              <span className="font-mono">{iter.iteration}</span>
                              {reviewStatus === 'completed' && (
                                <Check size={11} className="text-muted-foreground" />
                              )}
                              {reviewStatus === 'expired' && (
                                <XCircle size={11} className="text-muted-foreground" />
                              )}
                              {reviewStatus === 'pending' && (
                                <Circle
                                  size={9}
                                  className={cn(
                                    'fill-current',
                                    isActive ? 'text-primary' : 'text-muted-foreground/50',
                                  )}
                                />
                              )}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Previous iteration feedback */}
            {prevIteration?.review?.feedback && (
              <div className="px-4 py-3 border-b border-border/50 overflow-auto max-h-28">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Previous Feedback
                </p>
                <blockquote className="text-xs text-muted-foreground italic border-l-2 border-orange-400 pl-2">
                  {prevIteration.review.feedback}
                </blockquote>
              </div>
            )}

            {/* Message text context */}
            {effectiveMessageText && (
              <div className="px-4 py-3 border-b border-border/50 overflow-auto flex-1 min-h-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Message
                </p>
                <div className="text-sm leading-relaxed">
                  <MarkdownContent content={effectiveMessageText} />
                </div>
              </div>
            )}

            {/* Review actions */}
            {effectiveReview && onReviewRespond && (
              <div className="flex-1 px-4 py-3 overflow-auto">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Review
                </p>
                <ReviewCard
                  review={effectiveReview}
                  messageId={effectiveMessageId}
                  onRespond={async (mid, resp, _modifiedFileIds, options) => {
                    // Build modifiedFileIds map from all annotated attachments
                    const modifiedFileIds: Record<string, string> = {};
                    for (const a of effectiveAttachments) {
                      const anno = annotations[a.id];
                      if (anno?.fileId) modifiedFileIds[a.id] = anno.fileId;
                    }
                    await onReviewRespond(
                      mid,
                      resp,
                      Object.keys(modifiedFileIds).length ? modifiedFileIds : undefined,
                      options,
                    );
                  }}
                />
              </div>
            )}

            {/* Empty state if no review and no text */}
            {!effectiveReview && !effectiveMessageText && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">No additional context</p>
              </div>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
});
