'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: MarkdownContentProps) {
  // If content has no markdown indicators, render as plain text for perf
  if (!hasMarkdown(content)) {
    return <span className={className}>{content}</span>;
  }

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Keep links safe: open in new tab, add noopener
          a: ({ children, href, ...props }) => (
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
          // Inline code
          code: ({ children, className: codeClassName, ...props }) => {
            const isBlock = codeClassName?.startsWith('language-');
            if (isBlock) {
              return (
                <code
                  className={cn(
                    'block bg-muted/60 rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto',
                    codeClassName,
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-muted/60 rounded px-1 py-0.5 text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          // Pre block wrapper
          pre: ({ children, ...props }) => (
            <pre className="bg-muted/60 rounded-lg p-3 overflow-x-auto text-xs my-2" {...props}>
              {children}
            </pre>
          ),
          // Tables
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-2 -mx-1">
              <table className="min-w-[360px] text-xs border-collapse" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border border-border px-2 py-1 bg-muted/40 text-left font-medium"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-border px-2 py-1" {...props}>
              {children}
            </td>
          ),
          // Lists
          ul: ({ children, ...props }) => (
            <ul className="list-disc list-inside space-y-0.5 my-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal list-inside space-y-0.5 my-1" {...props}>
              {children}
            </ol>
          ),
          // Blockquote
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Paragraphs — avoid extra margin for single-line messages
          p: ({ children, ...props }) => (
            <p className="my-1 first:mt-0 last:mb-0" {...props}>
              {children}
            </p>
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
  return /[*_`~\[#>|]|-{3,}|\d+\.\s/.test(text);
}
