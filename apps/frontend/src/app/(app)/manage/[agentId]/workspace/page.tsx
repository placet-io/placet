'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Folder,
  FolderOpen,
  FileText,
  Save,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  FileWarning,
  Copy,
  Check,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/manage/code-editor';
import { manageApi } from '@/components/manage/manage-api';
import { cn } from '@/lib/utils';

interface TreeNode {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
  mtime?: number;
  children?: TreeNode[];
  error?: string;
}

interface TreeResponse {
  root: string;
  tree: TreeNode;
}

interface FileResponse {
  path: string;
  size: number;
  encoding: 'utf-8' | 'base64';
  content: string;
}

const MAX_EDIT_BYTES = 2 * 1024 * 1024; // 2 MiB editable cap

export default function AgentWorkspacePage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const search = useSearchParams();
  const router = useRouter();
  const pathParam = search.get('path');

  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(pathParam ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(pathParam ? parentDirs(pathParam) : ['.']),
  );

  // Keep selection in sync with the URL so the mobile back button (which
  // navigates to `/manage/:id/workspace` without a `path` query) clears the
  // selection and returns the user to the tree view.
  useEffect(() => {
    setSelected(pathParam ?? null);
  }, [pathParam]);

  const selectFile = useCallback(
    (path: string | null) => {
      const next = new URLSearchParams();
      if (path) next.set('path', path);
      const qs = next.toString();
      router.replace(`/manage/${agentId}/workspace${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [agentId, router],
  );

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<TreeResponse>(agentId, 'workspace/tree?depth=4');
      setTree(data.tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspace tree');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <ManagePane
      title="Workspace"
      subtitle="Browse the agent's workspace directory."
      backHref={selected ? `/manage/${agentId}/workspace` : '/manage'}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => void loadTree()}
          disabled={loading}
          title="Refresh"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </Button>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <ManageCard
          className={cn('md:sticky md:top-4', selected && 'hidden md:block')}
          bodyClassName="overflow-auto max-h-[calc(100vh-10rem)]"
        >
          {tree ? (
            <TreeView
              node={tree}
              depth={0}
              expanded={expanded}
              onToggle={toggleDir}
              selected={selected}
              onSelect={selectFile}
            />
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <ManageEmptyState
              icon={Folder}
              title="No workspace data"
              description="Could not read the agent's workspace."
            />
          )}
        </ManageCard>

        <div className={cn('min-w-0', !selected && 'hidden md:block')}>
          {selected ? (
            <FileEditor
              agentId={agentId}
              path={selected}
              onDeleted={() => {
                selectFile(null);
                void loadTree();
              }}
              onSaved={() => {
                void loadTree();
              }}
              onError={setError}
            />
          ) : (
            <ManageCard className="border-dashed">
              <ManageEmptyState
                icon={FileText}
                title="No file selected"
                description="Pick a file from the tree to view or edit it."
              />
            </ManageCard>
          )}
        </div>
      </div>
    </ManagePane>
  );
}

function parentDirs(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const out = ['.'];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join('/'));
  }
  return out;
}

// ---------------------------------------------------------------------------

function TreeView({
  node,
  depth,
  expanded,
  onToggle,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
}): ReactNode {
  if (node.type === 'file') {
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={cn(
          'flex items-center gap-1.5 w-full text-left rounded px-1.5 py-0.5 text-sm hover:bg-muted/60',
          selected === node.path && 'bg-muted text-foreground',
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <FileText size={12} className="text-muted-foreground shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }
  const isOpen = expanded.has(node.path || '.');
  const label = node.path === '.' ? 'workspace' : node.name;
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.path || '.')}
        className="flex items-center gap-1 w-full text-left rounded px-1.5 py-0.5 text-sm font-medium hover:bg-muted/60"
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {isOpen ? (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        )}
        {isOpen ? (
          <FolderOpen size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <Folder size={12} className="text-muted-foreground shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </button>
      {isOpen &&
        node.children?.map((c) => (
          <TreeView
            key={c.path}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FileEditor({
  agentId,
  path,
  onSaved,
  onDeleted,
  onError,
}: {
  agentId: string;
  path: string;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [file, setFile] = useState<FileResponse | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFile(null);
    try {
      const data = await manageApi<FileResponse>(
        agentId,
        `workspace/file?path=${encodeURIComponent(path)}`,
      );
      setFile(data);
      setContent(data.encoding === 'utf-8' ? data.content : '');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [agentId, path, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => file?.encoding === 'utf-8' && content !== file.content,
    [file, content],
  );

  const save = useCallback(async () => {
    if (!file || file.encoding !== 'utf-8') return;
    setSaving(true);
    try {
      await manageApi(agentId, `workspace/file?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      });
      setFile({ ...file, content, size: new Blob([content]).size });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [agentId, path, content, file, onSaved, onError]);

  const remove = useCallback(async () => {
    try {
      await manageApi(agentId, `workspace/file?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete file');
      setConfirmDelete(false);
    }
  }, [agentId, path, onDeleted, onError]);

  const tooLarge = (file?.size ?? 0) > MAX_EDIT_BYTES;
  const binary = file?.encoding === 'base64';

  const stats = useMemo(() => {
    const chars = content.length;
    const lines = content === '' ? 0 : content.split('\n').length;
    const words = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
    // Rough GPT-tokenizer approximation: ~4 chars per token for English / code.
    const tokens = Math.round(chars / 4);
    return { chars, words, lines, tokens };
  }, [content]);

  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onError('Failed to copy to clipboard');
    }
  }, [content, onError]);

  return (
    <ManageCard
      flush
      bodyClassName={cn(
        // Re-add padding only for non-editor states so the editor itself sits flush.
        (loading || binary || tooLarge || !file) && 'p-4 md:p-5',
      )}
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <FileText size={16} className="text-muted-foreground" />
          <span className="truncate font-mono">{path}</span>
          {file && (
            <span className="text-sm font-normal text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          )}
        </span>
      }
      actions={
        confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Delete?</span>
            <Button variant="destructive" size="sm" onClick={() => void remove()}>
              Yes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => void copy()}
              disabled={binary || !file}
              title="Copy contents"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void save()}
              disabled={!dirty || saving || binary || tooLarge}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              title="Delete"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )
      }
    >
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}
      {!loading && binary && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <FileWarning size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm">Binary file — editing is disabled. Download or delete only.</p>
        </div>
      )}
      {!loading && !binary && tooLarge && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm">
            File larger than {formatBytes(MAX_EDIT_BYTES)} — editing is disabled.
          </p>
        </div>
      )}
      {!loading && !binary && !tooLarge && file && (
        <>
          <CodeEditor
            value={content}
            onChange={setContent}
            path={path}
            minHeight="50vh"
            maxHeight="70vh"
            flush
          />
          <div className="flex items-center justify-between gap-4 border-t border-border/60 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>
                <span className="font-medium text-foreground">{stats.words.toLocaleString()}</span>{' '}
                words
              </span>
              <span>
                <span className="font-medium text-foreground">{stats.chars.toLocaleString()}</span>{' '}
                chars
              </span>
              <span>
                <span className="font-medium text-foreground">{stats.lines.toLocaleString()}</span>{' '}
                lines
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span title="Rough estimate (~4 chars / token)">
                ≈{' '}
                <span className="font-medium text-foreground">{stats.tokens.toLocaleString()}</span>{' '}
                tokens
              </span>
              {dirty && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  Unsaved
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </ManageCard>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}
