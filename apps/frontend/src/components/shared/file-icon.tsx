import { memo } from 'react';
import {
  FileText,
  ImageIcon,
  Film,
  Music,
  Archive,
  FileCode,
  Presentation,
  FileSpreadsheet,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { isCodeFile, isCodeMime } from '@/lib/file-utils';

const SPREADSHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

const PRESENTATION_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);

const DOCUMENT_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

interface FileIconProps extends LucideProps {
  mimeType: string;
  filename?: string;
}

export const FileIcon = memo(function FileIcon({ mimeType, filename, ...props }: FileIconProps) {
  if ((filename && isCodeFile(filename)) || isCodeMime(mimeType)) return <FileCode {...props} />;
  if (mimeType.startsWith('image/')) return <ImageIcon {...props} />;
  if (mimeType.startsWith('video/')) return <Film {...props} />;
  if (mimeType.startsWith('audio/')) return <Music {...props} />;
  if (mimeType === 'application/pdf') return <FileText {...props} />;
  if (SPREADSHEET_MIMES.has(mimeType)) return <FileSpreadsheet {...props} />;
  if (PRESENTATION_MIMES.has(mimeType)) return <Presentation {...props} />;
  if (DOCUMENT_MIMES.has(mimeType)) return <FileText {...props} />;
  if (mimeType.startsWith('text/')) return <FileText {...props} />;
  return <Archive {...props} />;
});
