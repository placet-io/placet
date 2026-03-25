'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { Download, X, ChevronLeft, ChevronRight, Pen } from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Dialog, DialogClose, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReviewCard } from './review-card';
import { MarkdownContent } from './markdown-content';
import { FilePreview } from '@/components/files/file-preview';
import { CanvasOverlay } from './canvas-overlay';
import { formatFileSize, getFileTypeLabel } from '@/lib/file-utils';
import type { Attachment, Review } from '@humanproxy/shared';
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
  onReviewRespond?: (messageId: string, response: Record<string, unknown>) => Promise<void>;
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
}: FilePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    attachment ? attachments.findIndex((a) => a.id === attachment.id) : 0,
  );
  const [annotating, setAnnotating] = useState(false);
  const [annotationSubmitting, setAnnotationSubmitting] = useState(false);
  const canvasRef = useRef<CanvasOverlayHandle>(null);

  const current = attachments[currentIndex] ?? attachment;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < attachments.length - 1;
  const isImage = current?.mimeType.startsWith('image/') ?? false;
  const canAnnotate = isImage && review?.status === 'pending';
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

  const handleAnnotationSubmit = useCallback(async () => {
    if (!current || !canvasRef.current || !onReviewRespond) return;
    try {
      setAnnotationSubmitting(true);
      const blob = await canvasRef.current.exportBlob();
      if (!blob) return;

      // Upload annotated image as new file
      const formData = new FormData();
      const annotatedFilename = `annotated-${current.filename}`;
      if (channelId) formData.append('channelId', channelId);
      formData.append('file', blob, annotatedFilename);

      const uploadRes = await fetch('/api/files/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload annotation');
      const uploadData = (await uploadRes.json()) as { id: string; storageKey: string };

      await onReviewRespond(messageId, {
        annotationFileId: uploadData.id,
        annotationFilename: annotatedFilename,
        sourceFileId: current.id,
      });
      setAnnotating(false);
    } catch (err) {
      console.error('Annotation submit error:', err);
    } finally {
      setAnnotationSubmitting(false);
    }
  }, [channelId, current, messageId, onReviewRespond]);

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed inset-4 z-50 flex rounded-2xl bg-background ring-1 ring-foreground/10 overflow-hidden outline-none animate-in fade-in-0 zoom-in-95">
          {/* ── Left: File Viewer ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <DialogClose render={<Button variant="ghost" size="icon-sm" />}>
                  <X size={16} />
                </DialogClose>
                <span className="text-sm font-medium truncate max-w-75">{current.filename}</span>
              </div>
              <div className="flex items-center gap-1.5">
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
                      disabled={annotationSubmitting}
                      onClick={handleAnnotationSubmit}
                    >
                      {annotationSubmitting ? 'Saving…' : 'Submit Annotation'}
                    </Button>
                  </div>
                )}
                <Button variant="ghost" size="icon-sm" onClick={handleDownload}>
                  <Download size={16} />
                </Button>
              </div>
            </div>

            {/* Viewer */}
            <div className="flex-1 flex items-center justify-center p-4 relative overflow-auto bg-muted/20">
              {annotating && isImage ? (
                <CanvasOverlay ref={canvasRef} imageSrc={`/api/files/${current.id}/download`} />
              ) : (
                <FilePreview
                  fileId={current.id}
                  mimeType={current.mimeType}
                  filename={current.filename}
                  className="h-full"
                />
              )}
            </div>

            {/* Navigation for multiple files */}
            {attachments.length > 1 && (
              <div className="flex items-center justify-center gap-4 py-2 border-t border-border/50">
                <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={handlePrev}>
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentIndex + 1} / {attachments.length}
                </span>
                <Button variant="ghost" size="icon-sm" disabled={!hasNext} onClick={handleNext}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>

          {/* ── Right: Context Panel (hidden below lg) ── */}
          <div className="hidden lg:flex w-80 border-l border-border/50 flex-col overflow-hidden shrink-0">
            {/* File info */}
            <div className="px-4 py-3 border-b border-border/50 space-y-1">
              <p className="text-sm font-medium truncate">{current.filename}</p>
              <p className="text-xs text-muted-foreground">
                {label} · {size}
              </p>
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
                <ReviewCard review={review} messageId={messageId} onRespond={onReviewRespond} />
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
