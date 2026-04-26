'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileCode, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { manageApi } from '@/components/manage/manage-api';

interface ScriptEntry {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

interface ListResponse {
  items: ScriptEntry[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

function formatDate(s: number): string {
  if (!s) return '—';
  return new Date(s * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AgentScriptsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [items, setItems] = useState<ScriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<ListResponse>(agentId, 'scripts');
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scripts');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ManagePane
      title="Scripts"
      backHref="/manage"
      subtitle="Executable helper scripts in workspace/scripts."
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => void load()}
          disabled={loading}
          title="Refresh"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </Button>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && sorted.length === 0 && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={FileCode}
            title="No scripts yet"
            description="Drop a script into workspace/scripts/ to make it available here."
          />
        </ManageCard>
      )}

      {sorted.map((s) => (
        <ManageCard
          key={s.path}
          title={
            <span className="flex items-center gap-2 text-base font-semibold">
              <FileCode size={16} className="text-muted-foreground" />
              <span className="truncate font-mono">{s.name}</span>
            </span>
          }
          actions={
            <Link href={`/manage/${agentId}/workspace?path=${encodeURIComponent(s.path)}`}>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                <ExternalLink size={14} /> Open
              </Button>
            </Link>
          }
        >
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="font-mono">{s.path}</span>
            <span>{formatBytes(s.size)}</span>
            <span>{formatDate(s.mtime)}</span>
          </div>
        </ManageCard>
      ))}
    </ManagePane>
  );
}
