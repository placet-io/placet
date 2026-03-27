'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Download, X, ChevronLeft, ChevronRight, Pen, RotateCcw, Send } from 'lucide-react';
import { useAnnotations } from '@/lib/hooks/use-annotations';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Dialog, DialogClose, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReviewCard } from './review-card';
import { MarkdownContent } from './markdown-content';
import { FilePreview } from '@/components/files/file-preview';
import { CanvasOverlay } from './canvas-overlay';
import { PluginRenderer } from '@/components/plugins/plugin-renderer';
import { formatFileSize, getFileTypeLabel } from '@/lib/file-utils';
import { cn } from '@/lib/utils';
import type { Attachment, Review } from '@placet/shared';
import type { PluginAttachmentInfo, PluginReviewContext } from '@placet/shared';
import type { CanvasOverlayHandle } from './canvas-overlay';

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
  onReviewRespond?: (
    messageId: string,
    response: Record<string, unknown>,
    annotationFileId?: string,
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

  // Sync currentIndex whenever the attachment prop changes.
  useEffect(() => {
    if (attachment) {
      const idx = attachments.findIndex((a) => a.id === attachment.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
    setAnnotating(false);
  }, [attachment, attachments]);

  // Auto-show the annotated version when navigating to a file that has one.
  useEffect(() => {
    setViewingAnnotated(!!annotations[current?.id ?? '']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, annotations]);

  const current = attachments[currentIndex] ?? attachment;
  const annotation = current ? annotations[current.id] : undefined;
  const isPluginOnly = !!plugin && !current;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < attachments.length - 1;
  const isImage = current?.mimeType.startsWith('image/') ?? false;
  const canAnnotate = isImage;
  const label = current ? getFileTypeLabel(current.mimeType, current.filename) : '';
  const size = current ? formatFileSize(current.size) : '';

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
              </div>
              {!isPluginOnly && (
                <div className="flex items-center gap-1.5 shrink-0">
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
                isPluginOnly ? '' : 'p-4',
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
            {!isPluginOnly && (attachments.length > 1 || (annotation && !annotating)) && (
              <div className="flex items-center justify-center gap-3 py-2 border-t border-border/50 flex-wrap">
                {attachments.length > 1 && (
                  <>
                    <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={handlePrev}>
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {currentIndex + 1} / {attachments.length}
                    </span>
                    <Button variant="ghost" size="icon-sm" disabled={!hasNext} onClick={handleNext}>
                      <ChevronRight size={16} />
                    </Button>
                  </>
                )}
                {annotation && !annotating && (
                  <>
                    {attachments.length > 1 && (
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
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Plugin
                  </p>
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

            {/* Message text context */}
            {messageText && (
              <div className="px-4 py-3 border-b border-border/50 overflow-auto max-h-40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Message
                </p>
                <div className="text-xs leading-relaxed">
                  <MarkdownContent content={messageText} />
                </div>
              </div>
            )}

            {/* Review actions */}
            {review && onReviewRespond && (
              <div className="flex-1 px-4 py-3 overflow-auto">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Review
                </p>
                <ReviewCard
                  review={review}
                  messageId={messageId}
                  onRespond={async (mid, resp) => {
                    // Attach annotation file ID if an annotation exists for any attachment
                    const annoFileId = attachments
                      .map((a) => annotations[a.id]?.fileId)
                      .find(Boolean);
                    await onReviewRespond(mid, resp, annoFileId);
                  }}
                />
              </div>
            )}

            {/* Empty state if no review and no text */}
            {!review && !messageText && (
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
