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

// ── MIME type → short label ─────────────────────────────────────

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
  'application/gzip': 'GZ',
  'application/x-tar': 'TAR',
  'application/x-7z-compressed': '7Z',
  'application/x-rar-compressed': 'RAR',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/msword': 'DOC',
  'application/vnd.oasis.opendocument.text': 'ODT',
  'application/vnd.oasis.opendocument.presentation': 'ODP',
  'application/vnd.oasis.opendocument.spreadsheet': 'ODS',
  'text/csv': 'CSV',
  'text/html': 'HTML',
  'text/plain': 'TXT',
  'text/markdown': 'MD',
  'application/json': 'JSON',
  'application/xml': 'XML',
  'text/xml': 'XML',
  'application/javascript': 'JS',
  'text/javascript': 'JS',
  'text/css': 'CSS',
  'application/typescript': 'TS',
  'application/octet-stream': 'BIN',
};

/**
 * Returns a short, human-readable label for a file type.
 * For known MIME types, returns a fixed label (e.g. "PDF", "DOCX").
 * For media types, returns the subtype (e.g. "JPEG", "MP4").
 * Falls back to file extension or "FILE".
 */
export function getFileTypeLabel(mimeType: string, filename: string): string {
  if (MIME_LABELS[mimeType]) return MIME_LABELS[mimeType];

  const [type, subtype] = mimeType.split('/');
  if (['image', 'video', 'audio', 'text'].includes(type) && subtype) {
    return subtype.replace(/^x-/, '').replace(/\+.*$/, '').toUpperCase();
  }

  const ext = filename.split('.').pop();
  if (ext && ext.length <= 6) return ext.toUpperCase();

  return 'FILE';
}

// ── File icon mapping ───────────────────────────────────────────

const SPREADSHEET_MIMES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

const PRESENTATION_MIMES = new Set([
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.presentation',
]);

const DOCUMENT_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
]);

export function getFileIcon(mimeType: string, filename?: string) {
  // Check code files first — e.g. .ts files have MIME video/mp2t
  if ((filename && isCodeFile(filename)) || isCodeMime(mimeType)) return FileCode;
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType === 'application/pdf') return FileText;
  if (SPREADSHEET_MIMES.has(mimeType)) return FileSpreadsheet;
  if (PRESENTATION_MIMES.has(mimeType)) return Presentation;
  if (DOCUMENT_MIMES.has(mimeType)) return FileText;
  if (mimeType.startsWith('text/')) return FileText;
  return Archive;
}

// ── File size formatting ────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// ── Code / text file detection ──────────────────────────────────

const CODE_EXTENSIONS = new Set([
  'js',
  'ts',
  'jsx',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'go',
  'rs',
  'swift',
  'kt',
  'scala',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'sql',
  'graphql',
  'gql',
  'prisma',
  'json',
  'xml',
  'svg',
  'css',
  'scss',
  'less',
  'sass',
  'html',
  'htm',
  'md',
  'markdown',
  'mdx',
  'dockerfile',
  'makefile',
  'txt',
  'log',
  'csv',
]);

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function isCodeFile(filename: string): boolean {
  return CODE_EXTENSIONS.has(getFileExtension(filename));
}

export function isCodeMime(mimeType: string): boolean {
  return (
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript' ||
    mimeType === 'text/javascript' ||
    mimeType === 'text/css' ||
    mimeType === 'application/typescript'
  );
}

// ── Preview type routing ─────────────────────────────────────────

export type PreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'html'
  | 'markdown'
  | 'code'
  | 'csv'
  | 'spreadsheet'
  | 'document'
  | 'presentation'
  | 'fallback';

export function getPreviewType(mimeType: string, filename: string): PreviewType {
  // Check code files FIRST — e.g. .ts files have MIME video/mp2t
  if (isCodeFile(filename) || isCodeMime(mimeType)) return 'code';

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/html') return 'html';

  if (mimeType === 'text/markdown' || /\.(md|mdx|markdown)$/i.test(filename)) return 'markdown';
  if (mimeType === 'text/csv' || /\.csv$/i.test(filename)) return 'csv';

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.oasis.opendocument.spreadsheet'
  )
    return 'spreadsheet';

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.oasis.opendocument.text'
  )
    return 'document';

  if (PRESENTATION_MIMES.has(mimeType)) return 'presentation';

  if (mimeType.startsWith('text/')) return 'code';

  return 'fallback';
}
