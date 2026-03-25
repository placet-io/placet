'use client';

import { memo } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileTypeLabel, formatFileSize } from '@/lib/file-utils';
import { FileIcon } from '@/components/shared/file-icon';
import type { Attachment } from '@humanproxy/shared';

interface AttachmentCardProps {
  attachment: Attachment;
  onClick?: () => void;
  className?: string;
}

export const AttachmentCard = memo(function AttachmentCard({
  attachment,
  onClick,
  className,
}: AttachmentCardProps) {
  const label = getFileTypeLabel(attachment.mimeType, attachment.filename);
  const size = formatFileSize(attachment.size);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-left transition-colors hover:bg-background hover:border-border w-full',
        className,
      )}
    >
      <div className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-muted">
        <FileIcon
          mimeType={attachment.mimeType}
          filename={attachment.filename}
          size={16}
          className="text-muted-foreground"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{attachment.filename}</p>
        <p className="text-[10px] text-muted-foreground">
          {label} · {size}
        </p>
      </div>
      <Download size={12} className="shrink-0 text-muted-foreground" />
    </button>
  );
});
