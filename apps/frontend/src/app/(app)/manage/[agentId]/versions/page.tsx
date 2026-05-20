'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Eye, GitBranch, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import {
  ManageCard,
  ManageEmptyState,
  ManageSection,
  ManageStatTile,
} from '@/components/manage/manage-ui';
import { manageApi, manageApiText } from '@/components/manage/manage-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AgentVersion {
  sha: string;
  message: string;
  timestamp: string;
  actor: string;
  reason: string;
  files: string[];
}

interface AgentVersionListResponse {
  items: AgentVersion[];
  count: number;
  limit: number;
}

interface ImprovementCheck {
  name: string;
  status: string;
  detail?: string;
}

interface ImprovementRun {
  id: string;
  trigger: string;
  scopes: string[];
  status: string;
  created_at: string;
  updated_at: string;
  approval_state: string;
  proposal_summary: string;
  diff_artifacts: string[];
  checks: ImprovementCheck[];
  rollback_ref: string | null;
  metadata: Record<string, unknown>;
}

interface ImprovementListResponse {
  items: ImprovementRun[];
  count: number;
  limit: number;
}

interface SettingsResponse {
  advanced: Record<string, number | string | boolean>;
  self_improvement?: {
    mode: string;
  };
}

interface DiffFile {
  path: string;
  diff: string;
}

interface DiffTarget {
  title: string;
  description: string;
}

const RUN_STATUS_TONE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  proposed: 'default',
  approval_requested: 'default',
  applied: 'secondary',
  rolled_back: 'outline',
  rejected: 'destructive',
  failed_validation: 'destructive',
  no_change: 'outline',
  commented: 'outline',
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function countStatus(runs: ImprovementRun[], status: string): number {
  return runs.filter((run) => run.status === status).length;
}

function normalizeDiffPath(value: string): string {
  let path = value.trim().replace(/^"|"$/g, '');
  if (path === '/dev/null') return path;
  path = path.replace(/^[ab]\//, '');
  path = path.replace(/^snapshot\/workspace\//, '');
  return path;
}

function pathFromDiffHeader(line: string): string | null {
  const gitMatch = line.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/);
  if (gitMatch) return normalizeDiffPath(gitMatch[2] ?? 'Diff');
  const toFileMatch = line.match(/^\+\+\+\s+(.+)$/);
  if (toFileMatch) return normalizeDiffPath(toFileMatch[1] ?? 'Diff');
  return null;
}

function parseUnifiedDiffFiles(text: string, fallbackPath: string): DiffFile[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return [];

  const lines = normalized.split('\n');
  const hasGitSections = lines.some((line) => line.startsWith('diff --git '));
  if (!hasGitSections) {
    const path = lines.map(pathFromDiffHeader).find((candidate) => candidate !== null);
    return [{ path: path ?? fallbackPath, diff: normalized }];
  }

  const files: DiffFile[] = [];
  let currentPath = fallbackPath;
  let currentLines: string[] = [];

  for (const line of lines) {
    const gitPath = line.startsWith('diff --git ') ? pathFromDiffHeader(line) : null;
    if (gitPath) {
      if (currentLines.length > 0) {
        files.push({ path: currentPath, diff: currentLines.join('\n') });
      }
      currentPath = gitPath;
      currentLines = [line];
      continue;
    }

    const headerPath = pathFromDiffHeader(line);
    if (headerPath && currentLines.length > 0) currentPath = headerPath;
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    files.push({ path: currentPath, diff: currentLines.join('\n') });
  }
  return files;
}

function diffLineClassName(line: string): string {
  if (line.startsWith('diff --git') || line.startsWith('index ')) {
    return 'bg-muted/60 text-muted-foreground';
  }
  if (line.startsWith('@@')) return 'bg-sky-500/10 text-sky-700 dark:text-sky-300';
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-destructive/10 text-destructive';
  if (line.startsWith('+++') || line.startsWith('---')) return 'bg-muted/40 text-foreground';
  return 'text-muted-foreground';
}

export default function AgentVersionsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [runs, setRuns] = useState<ImprovementRun[]>([]);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [activeDiffPath, setActiveDiffPath] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: '100' }).toString();
      const [versionData, runData, settingsData] = await Promise.all([
        manageApi<AgentVersionListResponse>(agentId, `versions?${query}`),
        manageApi<ImprovementListResponse>(agentId, `versions/runs?${query}`),
        manageApi<SettingsResponse>(agentId, 'settings'),
      ]);
      setVersions(versionData.items ?? []);
      setRuns(runData.items ?? []);
      setSettings(settingsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agent versions');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      versions: versions.length,
      trackedFiles: new Set(versions.flatMap((version) => version.files)).size,
      pending: countStatus(runs, 'proposed') + countStatus(runs, 'approval_requested'),
      applied: countStatus(runs, 'applied'),
      selfImprovementMode: settings?.self_improvement?.mode ?? 'review',
      reflectionApply: settings?.advanced.reflection_auto_apply === false ? 'Manual' : 'Auto',
    }),
    [runs, settings, versions],
  );

  const checkpoint = useCallback(async () => {
    setBusyKey('checkpoint');
    setError(null);
    try {
      await manageApi(agentId, 'versions/checkpoint', {
        method: 'POST',
        body: JSON.stringify({ actor: 'placet', reason: 'manual Placet checkpoint' }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create checkpoint');
    } finally {
      setBusyKey(null);
    }
  }, [agentId, load]);

  const rollbackVersion = useCallback(
    async (version: AgentVersion) => {
      setBusyKey(`version:${version.sha}`);
      setError(null);
      try {
        await manageApi(agentId, `versions/${encodeURIComponent(version.sha)}/rollback`, {
          method: 'POST',
          body: JSON.stringify({
            actor: 'placet',
            reason: `rollback from Placet to ${version.sha}`,
          }),
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to roll back agent version');
      } finally {
        setBusyKey(null);
      }
    },
    [agentId, load],
  );

  const openVersionDiff = useCallback(
    async (version: AgentVersion) => {
      setDiffTarget({
        title: `Version ${version.sha}`,
        description: version.reason || version.message || 'Central agent version diff',
      });
      setDiffFiles([]);
      setActiveDiffPath(null);
      setDiffError(null);
      setDiffLoading(true);
      try {
        const text = await manageApiText(
          agentId,
          `versions/${encodeURIComponent(version.sha)}/diff`,
        );
        const files = parseUnifiedDiffFiles(text, version.files[0] ?? version.sha);
        setDiffFiles(files);
        setActiveDiffPath(files[0]?.path ?? null);
      } catch (e) {
        setDiffError(e instanceof Error ? e.message : 'Failed to load version diff');
      } finally {
        setDiffLoading(false);
      }
    },
    [agentId],
  );

  const openRunDiff = useCallback(
    async (run: ImprovementRun) => {
      setDiffTarget({
        title: `Run ${run.id}`,
        description: run.proposal_summary || 'Self-improvement proposal diff',
      });
      setDiffFiles([]);
      setActiveDiffPath(null);
      setDiffError(null);
      setDiffLoading(true);
      try {
        const files = await Promise.all(
          run.diff_artifacts.map(async (artifact) => {
            const query = new URLSearchParams({ path: artifact }).toString();
            const text = await manageApiText(
              agentId,
              `versions/runs/${encodeURIComponent(run.id)}/diff?${query}`,
            );
            const parsed = parseUnifiedDiffFiles(text, artifact);
            return parsed.length === 1
              ? (parsed[0] ?? { path: artifact, diff: text })
              : { path: artifact, diff: text };
          }),
        );
        setDiffFiles(files);
        setActiveDiffPath(files[0]?.path ?? null);
      } catch (e) {
        setDiffError(e instanceof Error ? e.message : 'Failed to load run diff');
      } finally {
        setDiffLoading(false);
      }
    },
    [agentId],
  );

  const actOnRun = useCallback(
    async (run: ImprovementRun, action: 'approve' | 'reject') => {
      setBusyKey(`run:${run.id}`);
      setError(null);
      try {
        const body = action === 'reject' ? { reason: 'Rejected from Placet management.' } : {};
        await manageApi(agentId, `versions/runs/${encodeURIComponent(run.id)}/${action}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : `Failed to ${action} run`);
      } finally {
        setBusyKey(null);
      }
    },
    [agentId, load],
  );

  const activeDiff = diffFiles.find((file) => file.path === activeDiffPath) ?? diffFiles[0];

  return (
    <>
      <ManagePane
        title="Agent Versions"
        subtitle="Central Git-backed agent state: Reflection, skills, memory, MCP, policy, cron and self-improvement rollbacks."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void checkpoint()}
              disabled={loading || busyKey === 'checkpoint'}
            >
              {busyKey === 'checkpoint' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <GitBranch size={16} />
              )}
              Checkpoint
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </Button>
          </div>
        }
        backHref={`/manage/${agentId}`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <ManageStatTile label="Versions" value={stats.versions} />
          <ManageStatTile label="Tracked Files" value={stats.trackedFiles} tone="primary" />
          <ManageStatTile label="Runs Awaiting Review" value={stats.pending} tone="primary" />
          <ManageStatTile label="Applied Runs" value={stats.applied} tone="ok" />
          <ManageStatTile label="Self-Improve Apply" value={stats.selfImprovementMode} />
          <ManageStatTile label="Reflection Apply" value={stats.reflectionApply} />
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <ManageSection title="Central Agent Versions">
          <ManageCard flush>
            {loading && versions.length === 0 ? (
              <ManageEmptyState title="Loading agent versions" icon={Loader2} />
            ) : versions.length === 0 ? (
              <ManageEmptyState
                title="No agent versions yet"
                description="Create a checkpoint or let Reflection/self-improvement change tracked agent state."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-220 text-sm">
                  <thead className="border-b border-border/50 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Version</th>
                      <th className="px-4 py-3 text-left font-semibold">Actor</th>
                      <th className="px-4 py-3 text-left font-semibold">Reason</th>
                      <th className="px-4 py-3 text-left font-semibold">Tracked Files</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {versions.map((version) => {
                      const busy = busyKey === `version:${version.sha}`;
                      const hasFiles = version.files.length > 0;
                      return (
                        <tr key={version.sha} className="align-top">
                          <td className="px-4 py-3">
                            <div className="font-mono text-xs text-foreground">{version.sha}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatTime(version.timestamp)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{version.actor}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="line-clamp-2 max-w-md text-muted-foreground">
                              {version.reason}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {hasFiles ? `${version.files.length} file(s)` : 'none'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!hasFiles || diffLoading}
                                onClick={() => void openVersionDiff(version)}
                              >
                                <Eye size={14} />
                                Diff
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void rollbackVersion(version)}
                              >
                                {busy ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <RotateCcw size={14} />
                                )}
                                Rollback
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ManageCard>
        </ManageSection>

        <ManageSection title="Self-Improvement Runs">
          <ManageCard flush>
            {loading && runs.length === 0 ? (
              <ManageEmptyState title="Loading self-improvement runs" icon={Loader2} />
            ) : runs.length === 0 ? (
              <ManageEmptyState
                title="No self-improvement runs yet"
                description="Runs appear here after /improve review or an automatic trigger. Applied runs create central agent versions."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-225 text-sm">
                  <thead className="border-b border-border/50 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Run</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Trigger</th>
                      <th className="px-4 py-3 text-left font-semibold">Checks</th>
                      <th className="px-4 py-3 text-left font-semibold">Diffs</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {runs.map((run) => {
                      const busy = busyKey === `run:${run.id}`;
                      const hasDiffs = run.diff_artifacts.length > 0;
                      const canApprove =
                        hasDiffs && ['proposed', 'approval_requested'].includes(run.status);
                      const canReject =
                        hasDiffs && !['applied', 'rejected', 'rolled_back'].includes(run.status);
                      const failedChecks = run.checks.filter(
                        (check) => check.status === 'failed',
                      ).length;
                      return (
                        <tr key={run.id} className="align-top">
                          <td className="px-4 py-3">
                            <div className="max-w-sm space-y-1">
                              <div className="font-mono text-xs text-foreground">{run.id}</div>
                              <div className="text-xs text-muted-foreground">
                                Updated {formatTime(run.updated_at)}
                              </div>
                              {run.proposal_summary && (
                                <div className="line-clamp-2 text-muted-foreground">
                                  {run.proposal_summary}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={RUN_STATUS_TONE[run.status] ?? 'outline'}>
                              {run.status}
                            </Badge>
                            {run.approval_state && run.approval_state !== 'none' && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {run.approval_state}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <div>{run.trigger}</div>
                            <div className="mt-1 text-xs">{run.scopes.join(', ') || 'none'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className={cn(
                                'text-sm font-medium',
                                failedChecks > 0
                                  ? 'text-destructive'
                                  : 'text-emerald-600 dark:text-emerald-400',
                              )}
                            >
                              {failedChecks > 0
                                ? `${failedChecks} failed`
                                : `${run.checks.length} passed`}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {hasDiffs ? `${run.diff_artifacts.length} artifact(s)` : 'none'}
                          </td>
                          <td className="px-4 py-3">
                            {hasDiffs ? (
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={diffLoading}
                                  onClick={() => void openRunDiff(run)}
                                >
                                  <Eye size={14} />
                                  Diff
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!canApprove || busy}
                                  onClick={() => void actOnRun(run, 'approve')}
                                >
                                  {busy && canApprove ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Check size={14} />
                                  )}
                                  Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!canReject || busy}
                                  onClick={() => void actOnRun(run, 'reject')}
                                >
                                  <X size={14} />
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <div className="text-right text-xs text-muted-foreground">
                                No file changes
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ManageCard>
        </ManageSection>
      </ManagePane>

      <Dialog
        open={diffTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDiffTarget(null);
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-6">
            <DialogTitle>{diffTarget?.title ?? 'Diff'}</DialogTitle>
            {diffTarget?.description && (
              <DialogDescription className="line-clamp-2">
                {diffTarget.description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            {diffLoading ? (
              <div className="flex min-h-80 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
                Loading diff
              </div>
            ) : diffError ? (
              <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {diffError}
              </div>
            ) : diffFiles.length === 0 ? (
              <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
                No diff available
              </div>
            ) : (
              <>
                <div className="overflow-x-auto border-b bg-muted/20 px-3 py-2">
                  <div className="flex min-w-max gap-2">
                    {diffFiles.map((file, index) => (
                      <button
                        key={`${file.path}:${index}`}
                        type="button"
                        onClick={() => setActiveDiffPath(file.path)}
                        className={cn(
                          'max-w-72 truncate rounded-md border px-3 py-1.5 text-left font-mono text-xs transition-colors',
                          file.path === activeDiff?.path
                            ? 'border-primary bg-background text-foreground shadow-sm'
                            : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground',
                        )}
                        title={file.path}
                      >
                        {file.path}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-background">
                  <pre className="min-w-max py-3 text-xs leading-5">
                    {activeDiff?.diff.split('\n').map((line, index) => (
                      <code
                        key={`${activeDiff.path}:${index}`}
                        className={cn('block px-4 whitespace-pre', diffLineClassName(line))}
                      >
                        {line || ' '}
                      </code>
                    ))}
                  </pre>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
