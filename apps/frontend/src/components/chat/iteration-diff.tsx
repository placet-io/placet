'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilePreview } from '@/components/files/file-preview';
import { computeTextDiff, hasChanges, type DiffLine } from '@/lib/diff-utils';
import { cn } from '@/lib/utils';

/** Check if a MIME type represents diffable text content */
function isDiffableMime(mimeType: string): boolean {
  return (
    mimeType === 'text/markdown' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/html' ||
    mimeType.startsWith('text/')
  );
}

interface AttachmentRef {
  id: string;
  mimeType: string;
  filename: string;
}

interface IterationDiffProps {
  /** Text of the previous iteration (message.text) */
  oldText?: string | null;
  /** Text of the current iteration (message.text) */
  newText?: string | null;
  /** Previous iteration's first image attachment */
  oldImage?: AttachmentRef | null;
  /** Current iteration's first image attachment */
  newImage?: AttachmentRef | null;
  /** Previous iteration's attachments (for text-content diffing) */
  oldAttachments?: AttachmentRef[];
  /** Current iteration's attachments (for text-content diffing) */
  newAttachments?: AttachmentRef[];
  /** Labels for the comparison sides */
  oldLabel?: string;
  newLabel?: string;
  className?: string;
}

/**
 * Hook: fetch text content from a file attachment for diffing.
 * Returns null while loading or on error.
 */
function useAttachmentText(attachment: AttachmentRef | null): string | null {
  const [result, setResult] = useState<{ id: string; text: string } | null>(null);
  const attachmentId = attachment?.id ?? null;

  useEffect(() => {
    if (!attachmentId) return;
    let cancelled = false;
    fetch(`/api/files/${attachmentId}/download`, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setResult({ id: attachmentId, text: t });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return attachmentId && result?.id === attachmentId ? result.text : null;
}

export const IterationDiff = memo(function IterationDiff({
  oldText,
  newText,
  oldImage,
  newImage,
  oldAttachments,
  newAttachments,
  oldLabel = 'Previous',
  newLabel = 'Current',
  className,
}: IterationDiffProps) {
  const [showDiff, setShowDiff] = useState(true);

  // ── Text-attachment diffing: find matching text attachments by filename ──
  const textAttachmentPair = (() => {
    if (!oldAttachments?.length || !newAttachments?.length) return null;
    for (const newAtt of newAttachments) {
      if (!isDiffableMime(newAtt.mimeType)) continue;
      const oldAtt = oldAttachments.find(
        (a) => a.filename === newAtt.filename && isDiffableMime(a.mimeType),
      );
      if (oldAtt) return { oldAtt, newAtt };
    }
    return null;
  })();

  const oldAttachmentText = useAttachmentText(textAttachmentPair?.oldAtt ?? null);
  const newAttachmentText = useAttachmentText(textAttachmentPair?.newAtt ?? null);

  const attachmentTextChanged =
    oldAttachmentText != null && newAttachmentText != null
      ? hasChanges(oldAttachmentText, newAttachmentText)
      : false;

  const attachmentDiffLines = useMemo<DiffLine[]>(() => {
    if (!attachmentTextChanged || !oldAttachmentText || !newAttachmentText) return [];
    return computeTextDiff(oldAttachmentText, newAttachmentText);
  }, [attachmentTextChanged, oldAttachmentText, newAttachmentText]);

  // ── Message text diff (message.text — the agent's cover text) ──
  const msgTextChanged = oldText && newText ? hasChanges(oldText, newText) : false;

  const msgDiffLines = useMemo<DiffLine[]>(() => {
    if (!msgTextChanged || !oldText || !newText) return [];
    return computeTextDiff(oldText, newText);
  }, [msgTextChanged, oldText, newText]);

  const hasImageComparison = !!oldImage && !!newImage;
  // Prefer attachment-level text diff over message.text diff
  const hasTextComparison = attachmentTextChanged || (!!oldText && !!newText && msgTextChanged);
  const diffLines = attachmentTextChanged ? attachmentDiffLines : msgDiffLines;
  const diffLabel = attachmentTextChanged ? textAttachmentPair!.newAtt.filename : undefined;

  if (!hasTextComparison && !hasImageComparison) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <ArrowLeftRight size={12} />
          Changes from {oldLabel}
          {diffLabel && <span className="text-muted-foreground/70">({diffLabel})</span>}
        </span>
        {hasTextComparison && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setShowDiff((v) => !v)}
          >
            {showDiff ? 'Hide diff' : 'Show diff'}
          </Button>
        )}
      </div>

      {/* Text diff */}
      {hasTextComparison && showDiff && (
        <div className="rounded-lg border border-border bg-muted/30 overflow-auto max-h-64 text-xs font-mono">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={cn(
                'px-3 py-0.5 whitespace-pre-wrap wrap-break-word',
                line.type === 'added' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                line.type === 'removed' &&
                  'bg-red-500/10 text-red-700 dark:text-red-400 line-through',
              )}
            >
              <span className="select-none mr-2 text-muted-foreground/60">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
              </span>
              {line.value || '\u00A0'}
            </div>
          ))}
        </div>
      )}

      {/* Image comparison — side by side */}
      {hasImageComparison && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{oldLabel}</span>
            <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
              <FilePreview
                fileId={oldImage!.id}
                mimeType={oldImage!.mimeType}
                filename={oldImage!.filename}
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{newLabel}</span>
            <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
              <FilePreview
                fileId={newImage!.id}
                mimeType={newImage!.mimeType}
                filename={newImage!.filename}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
