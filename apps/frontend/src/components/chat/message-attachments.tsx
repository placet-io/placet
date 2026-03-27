'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { AttachmentCard } from './attachment-card';
import { useChatSettings } from '@/lib/hooks/use-chat-settings';
import { useAnnotations } from '@/lib/hooks/use-annotations';
import type { Attachment } from '@placet/shared';

interface MessageAttachmentsProps {
  attachments: Attachment[];
  onPreview: (attachment: Attachment) => void;
}

// ── Inline HTML viewer ────────────────────────────────────────────────────────
// Fetches the HTML file (auth-gated), injects a minimal responsive CSS reset
// so the content never overflows the chat bubble, then renders it in a
// sandboxed iframe that auto-sizes to its content height.

interface InlineHtmlViewerProps {
  att: Attachment;
  onPreview: () => void;
}

const RESPONSIVE_CSS = `
  html, body {
    margin: 0;
    padding: 8px;
    box-sizing: border-box;
    max-width: 100%;
    overflow-x: hidden;
    word-break: break-word;
  }
  img, video, iframe, table {
    max-width: 100%;
    height: auto;
  }
`;

const RESIZE_SCRIPT = `
  <script>
    function reportHeight() {
      if (!document.body) return;
      window.parent.postMessage(
        { type: '__hp_iframe_height__', height: document.body.scrollHeight },
        '*'
      );
    }
    function startObserver() {
      if (!document.body) return;
      new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
      reportHeight();
    }
    if (document.body) { startObserver(); }
    else { document.addEventListener('DOMContentLoaded', startObserver); }
    window.addEventListener('load', reportHeight);
  </script>
`;

function injectIntoHtml(raw: string): string {
  const injected = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${RESPONSIVE_CSS}</style>${RESIZE_SCRIPT}`;
  // Inject right after <head> or at the very start if no head tag
  if (/<head[\s>]/i.test(raw)) {
    return raw.replace(/(<head(?:[^>]*)>)/i, `$1${injected}`);
  }
  return injected + raw;
}

const InlineHtmlViewer = memo(function InlineHtmlViewer({ att, onPreview }: InlineHtmlViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(200);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/${att.id}/download`, { credentials: 'include' })
      .then((r) => r.text())
      .then((html) => {
        if (!cancelled) setSrcdoc(injectIntoHtml(html));
      })
      .catch(() => {
        /* silently fall back to attachment card */
      });
    return () => {
      cancelled = true;
    };
  }, [att.id]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (
        e.data &&
        typeof e.data === 'object' &&
        e.data.type === '__hp_iframe_height__' &&
        typeof e.data.height === 'number'
      ) {
        // Clamp between 80 px and 480 px to keep the bubble readable
        setIframeHeight(Math.min(Math.max(e.data.height, 80), 480));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!srcdoc) {
    return (
      <div className="mt-2 h-24 flex items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground animate-pulse">
        Loading HTML…
      </div>
    );
  }

  return (
    <div className="mt-2 relative group rounded-xl overflow-hidden border border-border/40">
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        title={att.filename}
        // allow-same-origin needed so the script can read document.body.scrollHeight
        sandbox="allow-scripts allow-same-origin"
        className="w-full block"
        style={{ height: iframeHeight, border: 'none' }}
      />
      {/* Expand overlay */}
      <button
        type="button"
        onClick={onPreview}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/80"
        title="Open in preview"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
});

interface MessageAttachmentsProps {
  attachments: Attachment[];
  onPreview: (attachment: Attachment) => void;
}

export const MessageAttachments = memo(function MessageAttachments({
  attachments,
  onPreview,
}: MessageAttachmentsProps) {
  const { settings } = useChatSettings();
  const { annotations } = useAnnotations();

  if (attachments.length === 0) return null;

  // Single HTML file with inline rendering enabled → InlineHtmlViewer
  if (attachments.length === 1 && attachments[0].mimeType === 'text/html' && settings.inlineHtml) {
    const att = attachments[0];
    return <InlineHtmlViewer att={att} onPreview={() => onPreview(att)} />;
  }

  // Single image → inline thumbnail (annotated version if one exists)
  if (attachments.length === 1 && attachments[0].mimeType.startsWith('image/')) {
    const att = attachments[0];
    const annotation = annotations[att.id];
    const thumbSrc = annotation
      ? `/api/files/${annotation.fileId}/download`
      : `/api/files/${att.id}/download`;
    return (
      <button
        type="button"
        onClick={() => onPreview(att)}
        className="mt-2 relative block rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
      >
        <img
          src={thumbSrc}
          alt={att.filename}
          className="max-w-full max-h-64 object-contain rounded-xl"
          loading="lazy"
        />
        {annotation && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-sm">
            Annotated
          </span>
        )}
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
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/80"
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
