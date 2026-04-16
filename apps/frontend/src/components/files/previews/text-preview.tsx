'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MarkdownContent } from '@/components/chat/markdown-content';
import { getFileExtension } from '@/lib/file-utils';
import { useChatSettings } from '@/lib/hooks/use-chat-settings';
import { cn } from '@/lib/utils';
import 'highlight.js/styles/github-dark.css';

interface TextPreviewProps {
  fileId: string;
  mimeType: string;
  filename: string;
  className?: string;
}

// Map file extensions to highlight.js language identifiers
const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  json: 'json',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sass: 'scss',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

export function TextPreview({ fileId, mimeType, filename, className }: TextPreviewProps) {
  const { content, loading, error } = useTextContent(fileId);
  const { settings } = useChatSettings();

  if (loading) return <PreviewLoader />;
  if (error || content === null) return <PreviewError message={error} />;

  if (mimeType === 'text/html') {
    return (
      <iframe
        srcDoc={content}
        sandbox={settings.inlineHtml ? 'allow-scripts allow-same-origin' : ''}
        title="HTML preview"
        className={cn('w-full rounded border-0 bg-white', className || 'h-[65vh]')}
      />
    );
  }

  const isMarkdown = mimeType === 'text/markdown' || /\.(md|mdx|markdown)$/i.test(filename);
  if (isMarkdown) {
    return (
      <div className={cn('w-full overflow-auto p-4', className || 'max-h-[65vh]')}>
        <MarkdownContent content={content} />
      </div>
    );
  }

  // Code / plain text with syntax highlighting
  return <CodeBlock content={content} filename={filename} />;
}

function CodeBlock({ content, filename }: { content: string; filename: string }) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  const ext = useMemo(() => getFileExtension(filename), [filename]);
  const lang = EXT_TO_LANG[ext] || undefined;

  useEffect(() => {
    import('highlight.js').then((mod) => {
      const hljs = mod.default;
      try {
        const result = lang
          ? hljs.highlight(content, { language: lang, ignoreIllegals: true })
          : hljs.highlightAuto(content);
        setHighlightedHtml(result.value);
      } catch {
        setHighlightedHtml(null);
      }
    });
  }, [content, lang]);

  return (
    <pre className="w-full max-h-[65vh] overflow-auto p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words bg-[#0d1117] rounded">
      {highlightedHtml ? (
        <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      ) : (
        <code className="text-foreground">{content}</code>
      )}
    </pre>
  );
}

// ── Shared helpers ──────────────────────────────────────────────

function useTextContent(fileId: string) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchText = async () => {
      try {
        const res = await fetch(`/api/files/${fileId}/download`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) {
          setContent(text);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchText();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return { content, loading, error };
}

export function PreviewLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-muted-foreground" />
    </div>
  );
}

export function PreviewError({ message }: { message?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground py-10">
      <p className="text-sm">Failed to load preview</p>
      {message && <p className="text-xs">{message}</p>}
    </div>
  );
}
