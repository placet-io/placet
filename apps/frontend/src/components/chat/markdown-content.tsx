'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Matches a storage file path: /&lt;cuid&gt; */
const STORAGE_FILE_RE = /^\/([a-z0-9]{20,})$/i;

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** Called when user clicks expand on an inline storage media element */
  onFilePreview?: (fileId: string) => void;
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
  onFilePreview,
}: MarkdownContentProps) {
  // If content has no markdown indicators, render as plain text for perf
  if (!hasMarkdown(content)) {
    return <span className={cn('whitespace-pre-wrap break-words', className)}>{content}</span>;
  }

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // Keep links safe: open in new tab, add noopener
          a: ({ children, href, node: _node, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              {...props}
            >
              {children}
            </a>
          ),
          // Inline images — detect storage file IDs (/<cuid>) and render with preview
          img: ({ node: _node, ...props }) => {
            const src = typeof props.src === 'string' ? props.src : undefined;
            const match = src?.match(STORAGE_FILE_RE);
            if (match) {
              return (
                <InlineStorageMedia fileId={match[1]} alt={props.alt} onExpand={onFilePreview} />
              );
            }
            // Regular external image
            return (
              <img
                {...props}
                src={src}
                alt={props.alt ?? ''}
                className="max-w-full max-h-64 object-contain rounded-lg my-2"
                loading="lazy"
              />
            );
          },
          // Code: inline only gets background, block code inside <pre> gets none
          code: ({ children, className: codeClassName, node: _n, ...props }) => {
            // Block code (inside <pre>) — check if content ends with newline (react-markdown adds trailing \n for blocks)
            const str = String(children);
            if (str.endsWith('\n') || codeClassName) {
              return (
                <code className={cn('text-xs font-mono text-foreground', codeClassName)} {...props}>
                  {children}
                </code>
              );
            }
            // Inline code
            return (
              <code
                className="bg-foreground/[0.07] border border-border/70 rounded px-1.5 py-0.5 text-xs font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          // Pre block wrapper
          pre: ({ children, node: _node, ...props }) => (
            <pre
              className="bg-foreground/[0.07] border border-border rounded-lg p-3 overflow-x-auto text-xs my-2"
              {...props}
            >
              {children}
            </pre>
          ),
          // Tables
          table: ({ children, node: _node, ...props }) => (
            <div className="overflow-x-auto my-2 -mx-1">
              <table className="min-w-[360px] text-xs border-collapse" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, node: _node, ...props }) => (
            <th
              className="border border-border px-2 py-1 bg-muted/40 text-left font-medium"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, node: _node, ...props }) => (
            <td className="border border-border px-2 py-1" {...props}>
              {children}
            </td>
          ),
          // Lists
          ul: ({ children, node: _node, ...props }) => (
            <ul className="list-disc list-inside space-y-0.5 my-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, node: _node, ...props }) => (
            <ol className="list-decimal list-inside space-y-0.5 my-1" {...props}>
              {children}
            </ol>
          ),
          // Blockquote
          blockquote: ({ children, node: _node, ...props }) => (
            <blockquote
              className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Paragraphs — avoid extra margin for single-line messages
          p: ({ children, node: _node, ...props }) => (
            <p className="my-1 first:mt-0 last:mb-0" {...props}>
              {children}
            </p>
          ),
          // Headings — scaled down to fit chat context
          h1: ({ children, node: _node, ...props }) => (
            <h1 className="text-base font-semibold mt-3 mb-1 first:mt-0" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, node: _node, ...props }) => (
            <h2 className="text-sm font-semibold mt-3 mb-1 first:mt-0" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, node: _node, ...props }) => (
            <h3 className="text-sm font-medium mt-2 mb-0.5 first:mt-0" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, node: _node, ...props }) => (
            <h4
              className="text-xs font-semibold mt-2 mb-0.5 first:mt-0 uppercase tracking-wide"
              {...props}
            >
              {children}
            </h4>
          ),
          h5: ({ children, node: _node, ...props }) => (
            <h5 className="text-xs font-medium mt-1.5 mb-0.5 first:mt-0" {...props}>
              {children}
            </h5>
          ),
          h6: ({ children, node: _node, ...props }) => (
            <h6
              className="text-xs font-medium mt-1.5 mb-0.5 first:mt-0 text-muted-foreground"
              {...props}
            >
              {children}
            </h6>
          ),
          // Horizontal rule
          hr: ({ ...props }) => <hr className="my-2 border-border" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

/** Quick heuristic to detect markdown syntax in text */
function hasMarkdown(text: string): boolean {
  return /[!*_`~\[#>|\n]|-{3,}|\d+\.\s/.test(text);
}

// ---------------------------------------------------------------------------
// Inline storage media component — resolves file type via HEAD request
// ---------------------------------------------------------------------------

function InlineStorageMedia({
  fileId,
  alt,
  onExpand,
}: {
  fileId: string;
  alt?: string;
  onExpand?: (fileId: string) => void;
}) {
  const src = `/api/files/${fileId}/download`;
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);

  useEffect(() => {
    // Determine media type from the content-type header
    fetch(src, { method: 'HEAD', credentials: 'include' })
      .then((res) => {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.startsWith('video/')) setMediaType('video');
        else setMediaType('image'); // default to image
      })
      .catch(() => setMediaType('image'));
  }, [src]);

  const handleExpand = useCallback(() => {
    onExpand?.(fileId);
  }, [fileId, onExpand]);

  if (!mediaType) {
    // Loading placeholder
    return <span className="inline-block my-2 w-48 h-32 rounded-xl bg-muted animate-pulse" />;
  }

  if (mediaType === 'video') {
    return (
      <span className="block my-2 rounded-xl overflow-hidden relative group not-prose">
        <video src={src} controls preload="metadata" className="max-w-full max-h-64 rounded-xl">
          <track kind="captions" />
        </video>
        {onExpand && (
          <button
            type="button"
            onClick={handleExpand}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="block my-2 relative group not-prose">
      <button
        type="button"
        onClick={onExpand ? handleExpand : undefined}
        className={cn(
          'block rounded-xl overflow-hidden',
          onExpand && 'cursor-pointer hover:opacity-90 transition-opacity',
        )}
      >
        <img
          src={src}
          alt={alt ?? 'image'}
          className="max-w-full max-h-64 object-contain rounded-xl"
          loading="lazy"
        />
      </button>
      {onExpand && (
        <button
          type="button"
          onClick={handleExpand}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/80"
        >
          <Maximize2 size={14} />
        </button>
      )}
    </span>
  );
}
