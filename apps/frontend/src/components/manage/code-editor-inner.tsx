'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { cn } from '@/lib/utils';

function extForPath(path: string): string {
  const base = path.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i === -1 ? base.toLowerCase() : base.slice(i + 1).toLowerCase();
}

/**
 * Lazy-load the language pack matching the file extension so the initial
 * bundle only ships CodeMirror core + EditorView, not every `lang-*` package.
 */
async function loadLangExtension(path: string): Promise<Extension | null> {
  const ext = extForPath(path);
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true });
    }
    case 'ts':
    case 'tsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true, typescript: true });
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'md':
    case 'mdx':
    case 'markdown': {
      const [{ markdown }, { languages }] = await Promise.all([
        import('@codemirror/lang-markdown'),
        import('@codemirror/language-data'),
      ]);
      return markdown({ codeLanguages: languages });
    }
    case 'py':
    case 'pyi': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'yml':
    case 'yaml': {
      const { yaml } = await import('@codemirror/lang-yaml');
      return yaml();
    }
    case 'html':
    case 'htm': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'css':
    case 'scss': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    default:
      return null;
  }
}

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

export default function CodeEditorInner({
  value,
  onChange,
  path,
  readOnly = false,
  minHeight = '40vh',
  maxHeight = '70vh',
  flush = false,
  className,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [langExt, setLangExt] = useState<Extension | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLangExtension(path)
      .then((ext) => {
        if (!cancelled) setLangExt(ext);
      })
      .catch(() => {
        if (!cancelled) setLangExt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const [darkTheme, setDarkTheme] = useState<Extension | null>(null);
  useEffect(() => {
    if (!isDark) return;
    let cancelled = false;
    import('@codemirror/theme-one-dark').then((m) => {
      if (!cancelled) setDarkTheme(m.oneDark);
    });
    return () => {
      cancelled = true;
    };
  }, [isDark]);

  const extensions = useMemo<Extension[]>(() => {
    const ext: Extension[] = [EditorView.lineWrapping];
    if (langExt) ext.push(langExt);
    return ext;
  }, [langExt]);

  return (
    <div
      className={cn('overflow-hidden', !flush && 'rounded-lg border border-border/60', className)}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={isDark ? (darkTheme ?? 'light') : 'light'}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          indentOnInput: true,
        }}
        minHeight={minHeight}
        maxHeight={maxHeight}
        style={{ fontSize: '13px' }}
      />
    </div>
  );
}
