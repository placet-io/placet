'use client';

import { cn } from '@/lib/utils';

export function MediaPreview({
  mimeType,
  src,
  className,
}: {
  mimeType: string;
  src: string;
  className?: string;
}) {
  if (mimeType.startsWith('image/')) {
    return (
      <img src={src} alt="preview" className="max-w-full max-h-[65vh] object-contain rounded" />
    );
  }

  if (mimeType.startsWith('video/')) {
    return <video src={src} controls className="max-w-full max-h-[65vh] rounded" />;
  }

  if (mimeType.startsWith('audio/')) {
    return <audio src={src} controls className="w-full" />;
  }

  if (mimeType === 'application/pdf') {
    return (
      <iframe
        src={src}
        title="PDF preview"
        className={cn('w-full rounded border-0', className ?? 'h-[65vh]')}
      />
    );
  }

  return null;
}
