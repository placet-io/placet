'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Clock,
  Play,
  Pause,
  Plus,
  RefreshCw,
  Loader2,
  Trash2,
  X,
  Zap,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { PillSwitch } from '@/components/manage/pill-switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { manageApi } from '@/components/manage/manage-api';
import { cn } from '@/lib/utils';

interface CronSchedule {
  kind: 'at' | 'every' | 'cron';
  at_ms?: number | null;
  every_ms?: number | null;
  expr?: string | null;
  tz?: string | null;
}

interface CronRunRecord {
  run_at_ms: number;
  status: 'ok' | 'error' | 'skipped';
  duration_ms: number;
  error?: string | null;
}

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  payload: {
    kind?: string;
    message: string;
    deliver: boolean;
    channel?: string | null;
    to?: string | null;
    detail_prompt?: string;
    scripts?: string[];
    require_approval?: boolean;
  };
  state: {
    next_run_at_ms?: number | null;
    last_run_at_ms?: number | null;
    last_status?: 'ok' | 'error' | 'skipped' | null;
    last_error?: string | null;
    run_history?: CronRunRecord[];
  };
  delete_after_run: boolean;
}

interface ListResponse {
  items: CronJob[];
  count: number;
}

function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeSchedule(s: CronSchedule): string {
  if (s.kind === 'cron') return `cron: ${s.expr ?? ''}${s.tz ? ` (${s.tz})` : ''}`;
  if (s.kind === 'every') {
    const ms = s.every_ms ?? 0;
    if (ms >= 3_600_000) return `every ${Math.round(ms / 3_600_000)} h`;
    if (ms >= 60_000) return `every ${Math.round(ms / 60_000)} min`;
    return `every ${Math.round(ms / 1000)} s`;
  }
  if (s.kind === 'at') return `at ${formatDateTime(s.at_ms)}`;
  return s.kind;
}

export default function AgentCronPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<ListResponse>(agentId, 'cron');
      setJobs(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cron jobs');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => [...jobs].sort((a, b) => a.name.localeCompare(b.name)), [jobs]);

  const upsertLocal = (j: CronJob) =>
    setJobs((prev) => {
      const idx = prev.findIndex((x) => x.id === j.id);
      if (idx === -1) return [...prev, j];
      const copy = prev.slice();
      copy[idx] = j;
      return copy;
    });

  const removeLocal = (id: string) => setJobs((prev) => prev.filter((x) => x.id !== id));

  return (
    <ManagePane
      title="Cron"
      backHref="/manage"
      subtitle="Scheduled jobs and their execution history."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setAdding(true)}
            className="gap-1.5"
            disabled={adding}
          >
            <Plus size={14} /> New job
          </Button>
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
        </div>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      {adding && (
        <NewCronCard
          agentId={agentId}
          onCancel={() => setAdding(false)}
          onCreated={(j) => {
            upsertLocal(j);
            setAdding(false);
          }}
          onError={setError}
        />
      )}

      {!loading && sorted.length === 0 && !adding && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={Clock}
            title="No cron jobs yet"
            description="Schedule a recurring or one-off task for this agent."
          />
        </ManageCard>
      )}

      {sorted.map((job) => (
        <CronCard
          key={job.id}
          agentId={agentId}
          job={job}
          onUpdated={upsertLocal}
          onDeleted={() => removeLocal(job.id)}
          onError={setError}
        />
      ))}
    </ManagePane>
  );
}

// ---------------------------------------------------------------------------
// Existing cron row
// ---------------------------------------------------------------------------

function CronCard({
  agentId,
  job,
  onUpdated,
  onDeleted,
  onError,
}: {
  agentId: string;
  job: CronJob;
  onUpdated: (j: CronJob) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const call = useCallback(
    async (action: 'pause' | 'resume' | 'run-now' | 'delete') => {
      setBusy(true);
      try {
        if (action === 'delete') {
          await manageApi(agentId, `cron/${encodeURIComponent(job.id)}`, {
            method: 'DELETE',
          });
          onDeleted();
          return;
        }
        if (action === 'run-now') {
          await manageApi(agentId, `cron/${encodeURIComponent(job.id)}/run-now`, {
            method: 'POST',
            body: '{}',
          });
          return;
        }
        const resp = await manageApi<CronJob>(
          agentId,
          `cron/${encodeURIComponent(job.id)}/${action}`,
          { method: 'POST', body: '{}' },
        );
        onUpdated(resp);
      } catch (e) {
        onError(e instanceof Error ? e.message : `Failed to ${action}`);
      } finally {
        setBusy(false);
        if (action === 'delete') setConfirmDelete(false);
      }
    },
    [agentId, job.id, onUpdated, onDeleted, onError],
  );

  const last = job.state.last_status;
  const history = job.state.run_history ?? [];

  return (
    <ManageCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <Clock size={16} className="text-muted-foreground" />
          <span className="truncate">{job.name}</span>
          <StatusBadge enabled={job.enabled} lastStatus={last ?? null} />
        </span>
      }
      actions={
        confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Delete?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void call('delete')}
              disabled={busy}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Yes'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void call('run-now')}
              disabled={busy}
              title="Run now"
            >
              <Zap size={14} /> Run now
            </Button>
            {job.enabled ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void call('pause')}
                disabled={busy}
                title="Pause"
              >
                <Pause size={14} /> Pause
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void call('resume')}
                disabled={busy}
                title="Resume"
              >
                <Play size={14} /> Resume
              </Button>
            )}
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
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Schedule" value={describeSchedule(job.schedule)} mono />
        <Field label="Next run" value={formatDateTime(job.state.next_run_at_ms)} />
        <Field label="Last run" value={formatDateTime(job.state.last_run_at_ms)} />
        <Field
          label="Delivery"
          value={
            job.payload.deliver
              ? `${job.payload.channel ?? '—'}${job.payload.to ? ` → ${job.payload.to}` : ''}`
              : 'No'
          }
        />
      </div>
      {job.payload.message && (
        <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <div className="text-sm font-medium text-muted-foreground mb-1">Message</div>
          <div className="text-sm whitespace-pre-wrap wrap-break-word">{job.payload.message}</div>
        </div>
      )}
      {job.state.last_error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive wrap-break-word">{job.state.last_error}</div>
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-medium text-muted-foreground mb-1.5">Recent runs</div>
          <div className="flex flex-wrap gap-1.5">
            {history.slice(-12).map((r, i) => (
              <span
                key={i}
                title={`${formatDateTime(r.run_at_ms)} · ${r.status}${r.duration_ms ? ` · ${r.duration_ms}ms` : ''}${r.error ? ` · ${r.error}` : ''}`}
                className={cn(
                  'h-2 w-4 rounded-sm',
                  r.status === 'ok' && 'bg-emerald-500',
                  r.status === 'error' && 'bg-destructive',
                  r.status === 'skipped' && 'bg-muted-foreground/40',
                )}
              />
            ))}
          </div>
        </div>
      )}
    </ManageCard>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className={cn('text-sm', mono && 'font-mono')}>{value}</div>
    </div>
  );
}

function StatusBadge({
  enabled,
  lastStatus,
}: {
  enabled: boolean;
  lastStatus: 'ok' | 'error' | 'skipped' | null;
}) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        <Pause size={10} /> Paused
      </span>
    );
  }
  if (lastStatus === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-destructive">
        <AlertCircle size={10} /> Error
      </span>
    );
  }
  if (lastStatus === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={10} /> OK
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// New cron card
// ---------------------------------------------------------------------------

type ScheduleMode = 'cron' | 'every';

function NewCronCard({
  agentId,
  onCancel,
  onCreated,
  onError,
}: {
  agentId: string;
  onCancel: () => void;
  onCreated: (j: CronJob) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ScheduleMode>('cron');
  const [expr, setExpr] = useState('0 9 * * *');
  const [tz, setTz] = useState('');
  const [everyValue, setEveryValue] = useState(15);
  const [everyUnit, setEveryUnit] = useState<'s' | 'm' | 'h'>('m');
  const [message, setMessage] = useState('');
  const [deliver, setDeliver] = useState(false);
  const [channel, setChannel] = useState('');
  const [to, setTo] = useState('');
  const [creating, setCreating] = useState(false);

  const valid =
    name.trim().length > 0 && (mode === 'cron' ? expr.trim().length > 0 : everyValue > 0);

  const create = useCallback(async () => {
    if (!valid) return;
    setCreating(true);
    try {
      const schedule =
        mode === 'cron'
          ? { kind: 'cron', expr: expr.trim(), tz: tz.trim() || undefined }
          : {
              kind: 'every',
              every_ms:
                everyValue * (everyUnit === 'h' ? 3_600_000 : everyUnit === 'm' ? 60_000 : 1000),
            };
      const body: Record<string, unknown> = {
        name: name.trim(),
        schedule,
        message,
        deliver,
      };
      if (deliver) {
        if (channel.trim()) body.channel = channel.trim();
        if (to.trim()) body.to = to.trim();
      }
      const j = await manageApi<CronJob>(agentId, 'cron', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onCreated(j);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to create cron job');
      setCreating(false);
    }
  }, [
    agentId,
    valid,
    name,
    mode,
    expr,
    tz,
    everyValue,
    everyUnit,
    message,
    deliver,
    channel,
    to,
    onCreated,
    onError,
  ]);

  return (
    <ManageCard
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <Plus size={16} className="text-muted-foreground" /> New cron job
        </span>
      }
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={onCancel}
          title="Cancel"
          disabled={creating}
        >
          <X size={14} />
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">Name</label>
          <Input
            placeholder="e.g. daily-digest"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 text-sm rounded-md max-w-md"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">Schedule</label>
          <PillSwitch<ScheduleMode>
            value={mode}
            onChange={setMode}
            aria-label="Schedule mode"
            options={(['cron', 'every'] as ScheduleMode[]).map((m) => ({
              value: m,
              label: m === 'cron' ? 'Cron expression' : 'Interval',
            }))}
          />
          {mode === 'cron' ? (
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="0 9 * * *"
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                className="h-9 text-sm rounded-md font-mono max-w-xs"
              />
              <Input
                placeholder="Timezone (optional, e.g. Europe/Berlin)"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="h-9 text-sm rounded-md max-w-xs"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm text-muted-foreground">every</span>
              <Input
                type="number"
                min={1}
                value={everyValue}
                onChange={(e) => setEveryValue(Number(e.target.value) || 0)}
                className="h-9 w-24 text-sm rounded-md"
              />
              <PillSwitch<'s' | 'm' | 'h'>
                value={everyUnit}
                onChange={setEveryUnit}
                size="sm"
                aria-label="Interval unit"
                options={[
                  { value: 's', label: 'sec' },
                  { value: 'm', label: 'min' },
                  { value: 'h', label: 'hr' },
                ]}
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">Message</label>
          <Textarea
            placeholder="Prompt the agent will receive when this job fires."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-sm min-h-20"
          />
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={deliver}
              onChange={(e) => setDeliver(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium">Deliver reply via channel</div>
              <p className="text-sm text-muted-foreground">
                Send the agent&apos;s response to an external channel instead of logging only.
              </p>
            </div>
          </label>
          {deliver && (
            <div className="grid gap-2 md:grid-cols-2 pl-6">
              <Input
                placeholder="Channel (e.g. whatsapp)"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="h-9 text-sm rounded-md"
              />
              <Input
                placeholder="Recipient (e.g. +49…)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 text-sm rounded-md"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="default"
            size="sm"
            onClick={() => void create()}
            disabled={!valid || creating}
            className="gap-1.5"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            Create
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
        </div>
      </div>
    </ManageCard>
  );
}
