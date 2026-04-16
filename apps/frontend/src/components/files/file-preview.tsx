'use client';

import { FileText } from 'lucide-react';
import { getPreviewType } from '@/lib/file-utils';
import { MediaPreview } from './previews/media-preview';
import { TextPreview } from './previews/text-preview';
import { DocumentPreview } from './previews/document-preview';
import { PresentationPreview } from './previews/presentation-preview';
import { SpreadsheetPreview } from './previews/spreadsheet-preview';

interface FilePreviewProps {
  fileId: string;
  mimeType: string;
  filename: string;
  className?: string;
}

export function FilePreview({ fileId, mimeType, filename, className }: FilePreviewProps) {
  const src = `/api/files/${fileId}/download`;
  const type = getPreviewType(mimeType, filename);

  switch (type) {
    case 'image':
    case 'video':
    case 'audio':
    case 'pdf':
      return <MediaPreview mimeType={mimeType} src={src} className={className} />;

    case 'html':
    case 'markdown':
    case 'code':
      return (
        <TextPreview
          fileId={fileId}
          mimeType={mimeType}
          filename={filename}
          className={className}
        />
      );

    case 'csv':
    case 'spreadsheet':
      return <SpreadsheetPreview fileId={fileId} mimeType={mimeType} />;

    case 'document':
      return <DocumentPreview fileId={fileId} mimeType={mimeType} />;

    case 'presentation':
      return <PresentationPreview fileId={fileId} />;

    default:
      return (
        <div className="flex flex-col items-center gap-3 text-muted-foreground py-10">
          <FileText size={48} />
          <p className="text-sm">No preview available for this file type</p>
        </div>
      );
  }
}
