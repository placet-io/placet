'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { getFileTypeLabel } from '@/lib/file-utils';

interface FileTypeBadgeProps {
  mimeType: string;
  filename: string;
}

export const FileTypeBadge = memo(function FileTypeBadge({
  mimeType,
  filename,
}: FileTypeBadgeProps) {
  return (
    <Badge variant="outline" className="text-[10px] shrink-0">
      {getFileTypeLabel(mimeType, filename)}
    </Badge>
  );
});
