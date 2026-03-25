'use client';

import { memo } from 'react';
import { Maximize2 } from 'lucide-react';
import { AttachmentCard } from './attachment-card';
import type { Attachment } from '@humanproxy/shared';

interface MessageAttachmentsProps {
  attachments: Attachment[];
  onPreview: (attachment: Attachment) => void;
}

export const MessageAttachments = memo(function MessageAttachments({
  attachments,
  onPreview,
}: MessageAttachmentsProps) {
  if (attachments.length === 0) return null;

  // Single image → inline thumbnail
  if (attachments.length === 1 && attachments[0].mimeType.startsWith('image/')) {
    const att = attachments[0];
    return (
      <button
        type="button"
        onClick={() => onPreview(att)}
        className="mt-2 block rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/files/${att.id}/download`}
          alt={att.filename}
          className="max-w-full max-h-64 object-contain rounded-xl"
          loading="lazy"
        />
      </button>
    );
  }

  // Single video → inline player with expand button
  if (attachments.length === 1 && attachments[0].mimeType.startsWith('video/')) {
    const att = attachments[0];
    return (
      <div className="mt-2 rounded-xl overflow-hidden relative group">
        <video
          src={`/api/files/${att.id}/download`}
          controls
          preload="metadata"
          className="max-w-full max-h-64 rounded-xl"
        >
          <track kind="captions" />
        </video>
        <button
          type="button"
          onClick={() => onPreview(att)}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    );
  }

  // Single non-image → card
  if (attachments.length === 1) {
    return (
      <div className="mt-2">
        <AttachmentCard attachment={attachments[0]} onClick={() => onPreview(attachments[0])} />
      </div>
    );
  }

  // Multiple attachments → grid of cards
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {attachments.map((att) => (
        <AttachmentCard key={att.id} attachment={att} onClick={() => onPreview(att)} />
      ))}
    </div>
  );
});
