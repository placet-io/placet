'use client';

import { isValidElement, memo, useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
/** Matches a storage file path: /&lt;cuid&gt; */
const STORAGE_FILE_RE = /^\/([a-z0-9]{20,})$/i;

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** When true, adapts element colours to sit on the user bubble (primary bg). */
  isUser?: boolean;
  /** Called when user clicks expand on an inline storage media element */
  onFilePreview?: (fileId: string) => void;
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
  isUser,
  onFilePreview,
}: MarkdownContentProps) {
  return (
    <div
      className={cn(
        'max-w-none',
        isUser
          ? '[&_strong]:font-semibold'
          : cn(
              'prose dark:prose-invert',
              // Tighter vertical rhythm — reduce default typography margins
              'prose-p:my-1 prose-hr:my-3 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0',
              'prose-img:my-2 prose-blockquote:my-2 prose-pre:my-2',
              'prose-headings:mt-3 prose-headings:mb-1',
            ),
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          // Keep links safe: open in new tab, add noopener
          a: ({ children, href, node: _node, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'underline underline-offset-2',
                isUser ? 'text-inherit hover:opacity-80' : 'text-primary hover:text-primary/80',
              )}
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
                <code className={cn('text-[13px] font-mono', codeClassName)} {...props}>
                  {children}
                </code>
              );
            }
            // Inline code
            const displayText = formatInlineCodeText(str);
            return (
              <code
                className={cn(
                  'rounded px-1.5 py-0.5 text-[13px] font-mono',
                  isUser
                    ? 'bg-primary-foreground/15'
                    : 'bg-foreground/[0.07] border border-border/70',
                )}
                {...props}
              >
                {displayText}
              </code>
            );
          },
          // Pre block wrapper — rendered as a CodeBlock with language header + copy button
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          // Tables
          table: ({ children, node: _node, ...props }) => (
            <div className="overflow-x-auto my-2 max-w-full">
              <table className="text-sm border-collapse" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, node: _node, ...props }) => (
            <th
              className={cn(
                'px-2 py-1 text-left font-medium border',
                isUser
                  ? 'border-primary-foreground/15 bg-primary-foreground/10'
                  : 'border-border bg-muted/40',
              )}
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, node: _node, ...props }) => (
            <td
              className={cn(
                'px-2 py-1 border',
                isUser ? 'border-primary-foreground/15' : 'border-border',
              )}
              {...props}
            >
              {children}
            </td>
          ),
          // Lists
          ul: ({ children, node: _node, ...props }) => (
            <ul className="list-disc pl-5 space-y-0.5 my-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, node: _node, ...props }) => (
            <ol className="list-decimal pl-5 space-y-0.5 my-1" {...props}>
              {children}
            </ol>
          ),
          // Blockquote
          blockquote: ({ children, node: _node, ...props }) => (
            <blockquote
              className={cn(
                'border-l-2 pl-3 my-2 italic',
                isUser ? 'border-primary-foreground/40' : 'border-primary/40 text-muted-foreground',
              )}
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
            <h1 className="text-[22px] font-semibold mt-3 mb-1 first:mt-0" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, node: _node, ...props }) => (
            <h2 className="text-xl font-semibold mt-3 mb-1 first:mt-0" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, node: _node, ...props }) => (
            <h3 className="text-lg font-medium mt-2 mb-0.5 first:mt-0" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, node: _node, ...props }) => (
            <h4 className="text-base font-semibold mt-2 mb-0.5 first:mt-0" {...props}>
              {children}
            </h4>
          ),
          h5: ({ children, node: _node, ...props }) => (
            <h5 className="text-sm font-medium mt-1.5 mb-0.5 first:mt-0" {...props}>
              {children}
            </h5>
          ),
          h6: ({ children, node: _node, ...props }) => (
            <h6
              className={cn(
                'text-sm font-medium mt-1.5 mb-0.5 first:mt-0',
                !isUser && 'text-muted-foreground',
              )}
              {...props}
            >
              {children}
            </h6>
          ),
          // Horizontal rule
          hr: ({ ...props }) => (
            <hr
              className={cn('my-2', isUser ? 'border-primary-foreground/30' : 'border-border')}
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ---------------------------------------------------------------------------
// CodeBlock — <pre> wrapper with language label + copy button as overlays
//
// Matches the original "clean" look (single rounded card, no extra header
// chrome) but with a uniformly dark background in both light and dark mode.
// The language and copy button are absolutely positioned inside the same
// card as subtle overlays that fade in on hover.
// ---------------------------------------------------------------------------

// Pretty names for common highlight.js language identifiers.
const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  cs: 'C#',
  cpp: 'C++',
  c: 'C',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  yml: 'YAML',
  yaml: 'YAML',
  json: 'JSON',
  md: 'Markdown',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  dockerfile: 'Dockerfile',
  xml: 'XML',
  diff: 'Diff',
  graphql: 'GraphQL',
  toml: 'TOML',
  ini: 'INI',
};

function formatLanguageLabel(lang: string | undefined): string | null {
  if (!lang) return null;
  const lower = lang.toLowerCase();
  return LANGUAGE_LABELS[lower] ?? lang;
}

function formatInlineCodeText(value: string): string {
  const escapedDelimiterMatch = /^\\`([\s\S]+)\\`$/.exec(value);
  if (escapedDelimiterMatch?.[1]?.trim()) return escapedDelimiterMatch[1];

  const delimiterMatch = /^(`+)([\s\S]+)\1$/.exec(value);
  if (delimiterMatch?.[2]?.trim()) return delimiterMatch[2];

  return value;
}

/** Recursively flattens a React node tree into its plain text content. */
function reactNodeToText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return reactNodeToText(props.children);
  }
  return '';
}

/** Extracts language id and raw text from the <code> child of a <pre>. */
function extractCodeMeta(children: React.ReactNode): {
  language: string | undefined;
  text: string;
} {
  let codeEl: React.ReactElement | null = null;
  if (isValidElement(children)) {
    codeEl = children as React.ReactElement;
  } else if (Array.isArray(children)) {
    codeEl = children.find((c): c is React.ReactElement => isValidElement(c)) ?? null;
  }

  let language: string | undefined;
  let text = '';
  if (codeEl) {
    const props = codeEl.props as {
      className?: string;
      children?: React.ReactNode;
    };
    const match = /language-([^\s]+)/.exec(props.className ?? '');
    if (match) language = match[1];
    // rehype-highlight wraps code in nested <span> tokens, so we must recurse
    // to recover the original source text instead of only top-level strings.
    text = reactNodeToText(props.children);
  }
  if (text.endsWith('\n')) text = text.slice(0, -1);
  return { language, text };
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const { language, text } = extractCodeMeta(children);
  const label = formatLanguageLabel(language);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure contexts); fail silently.
    }
  }, [text]);

  return (
    <div className="group/code relative my-2">
      <pre className="rounded-lg p-3 overflow-x-auto text-[13px] bg-[#0d1117] text-[#c9d1d9]">
        {children}
      </pre>
      <div className="pointer-events-none absolute top-1.5 right-1.5 flex items-center gap-1.5">
        {label && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-[#8b949e]/80">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]"
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline storage media component — resolves file type via HEAD request
// ---------------------------------------------------------------------------

// Module-scoped cache so each `[file://...]` reference HEADs the file once
// per page lifetime instead of once per InlineStorageMedia mount. Without
// this, navigating away/back or scrolling messages with many attachments
// re-issues the same HEAD per occurrence.
const mediaTypeCache = new Map<string, 'image' | 'video'>();
const mediaTypePending = new Map<string, Promise<'image' | 'video'>>();

function resolveMediaType(fileId: string, src: string): Promise<'image' | 'video'> {
  const cached = mediaTypeCache.get(fileId);
  if (cached) return Promise.resolve(cached);
  const pending = mediaTypePending.get(fileId);
  if (pending) return pending;
  const p = fetch(src, { method: 'HEAD', credentials: 'include' })
    .then((res) => {
      const ct = res.headers.get('content-type') ?? '';
      const kind: 'image' | 'video' = ct.startsWith('video/') ? 'video' : 'image';
      mediaTypeCache.set(fileId, kind);
      mediaTypePending.delete(fileId);
      return kind;
    })
    .catch(() => {
      mediaTypeCache.set(fileId, 'image');
      mediaTypePending.delete(fileId);
      return 'image' as const;
    });
  mediaTypePending.set(fileId, p);
  return p;
}

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
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(
    () => mediaTypeCache.get(fileId) ?? null,
  );

  // When `fileId` changes, eagerly read the cache for the new id so we render
  // synchronously without flashing the loading placeholder. This is a render-
  // phase derivation rather than an effect-driven setState.
  const cachedForCurrent = mediaTypeCache.get(fileId) ?? null;
  if (cachedForCurrent && cachedForCurrent !== mediaType) {
    setMediaType(cachedForCurrent);
  }

  useEffect(() => {
    if (mediaTypeCache.has(fileId)) return;
    let cancelled = false;
    void resolveMediaType(fileId, src).then((kind) => {
      if (!cancelled) setMediaType(kind);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, src]);

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
