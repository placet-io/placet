'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
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
          // Code: inline only gets background, block code inside <pre> gets none
          code: ({ children, className: codeClassName, node: _n, ...props }) => {
            // Block code (inside <pre>) — check if content ends with newline (react-markdown adds trailing \n for blocks)
            const str = String(children);
            if (str.endsWith('\n') || codeClassName) {
              return (
                <code className={cn('text-xs font-mono', codeClassName)} {...props}>
                  {children}
                </code>
              );
            }
            // Inline code
            return (
              <code className="bg-current/10 rounded px-1 py-0.5 text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          // Pre block wrapper
          pre: ({ children, node: _node, ...props }) => (
            <pre className="bg-current/10 rounded-lg p-3 overflow-x-auto text-xs my-2" {...props}>
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
  return /[*_`~\[#>|\n]|-{3,}|\d+\.\s/.test(text);
}
