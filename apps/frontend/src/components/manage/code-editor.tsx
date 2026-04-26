'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

export interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  path: string;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  /** When true, the editor renders flush (no border / rounded corners). */
  flush?: boolean;
  className?: string;
}

const CodeEditorInner = dynamic(() => import('./code-editor-inner'), {
  ssr: false,
  loading: () => (
    <div
      className={cn('overflow-hidden rounded-lg border border-border/60 bg-muted/20 animate-pulse')}
      style={{ minHeight: '40vh' }}
    />
  ),
});

export function CodeEditor(props: CodeEditorProps) {
  return <CodeEditorInner {...props} />;
}
