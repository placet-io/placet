'use client';

import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { FileIcon } from '@/components/shared/file-icon';

interface FileCardProps {
  filename: string;
  mimeType: string;
  size: string;
  agentName: string;
  date: string;
}

export const FileCard = memo(function FileCard({
  filename,
  mimeType,
  size,
  agentName,
  date,
}: FileCardProps) {
  return (
    <Card className="flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-accent/50">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
        <FileIcon
          mimeType={mimeType}
          filename={filename}
          className="h-5 w-5 text-muted-foreground"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{filename}</p>
        <p className="text-xs text-muted-foreground">
          {agentName} &middot; {size} &middot; {date}
        </p>
      </div>
    </Card>
  );
});
