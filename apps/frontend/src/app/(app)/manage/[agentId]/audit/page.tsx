'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, X, RefreshCw, Search } from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import {
  AuditTimeline,
  type AuditEvent,
  type AuditSelection,
} from '@/components/manage/audit-timeline';
import { ManageCard, ManageSection } from '@/components/manage/manage-ui';
import { ManageDataTable, type ManageTableColumn } from '@/components/manage/manage-data-table';
import { PillSwitch } from '@/components/manage/pill-switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { manageApi } from '@/components/manage/manage-api';
import { getAvatarColor } from '@/lib/avatar';
import { cn } from '@/lib/utils';

interface ListResponse {
  items: AuditEvent[];
  hasMore?: boolean;
}

type WindowKey = '15m' | '1h' | '6h' | '24h';
const WINDOWS: Record<WindowKey, { label: string; ms: number }> = {
  '15m': { label: '15 m', ms: 15 * 60_000 },
  '1h': { label: '1 h', ms: 60 * 60_000 },
  '6h': { label: '6 h', ms: 6 * 60 * 60_000 },
  '24h': { label: '24 h', ms: 24 * 60 * 60_000 },
};

interface AuditRow {
  key: string;
  ts: number;
  timeLabel: string;
  event: string;
  lane: string;
  model: string;
  status: string;
  summary: string;
  raw: AuditEvent;
}

function toRow(ev: AuditEvent, i: number): AuditRow {
  const ts = ev.ts ? Date.parse(ev.ts) : NaN;
  const timeLabel = Number.isFinite(ts)
    ? new Date(ts).toLocaleTimeString(undefined, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
  const channel = (ev.channel as string | undefined) ?? '';
  const origin = (ev.origin as string | undefined) ?? '';
  return {
    key: `${ev.ts ?? ''}-${i}`,
    ts: Number.isFinite(ts) ? ts : 0,
    timeLabel,
    event: (ev.event as string) ?? 'event',
    lane: channel || origin || 'other',
    model: (ev.model as string | undefined) ?? '',
    status: (ev.status as string | undefined) ?? '',
    summary: summarize(ev),
    raw: ev,
  };
}

function summarize(ev: AuditEvent): string {
  const parts: string[] = [];
  if (ev.run_id || ev.runId) parts.push(`run=${ev.run_id ?? ev.runId}`);
  if (ev.session_key || ev.sessionKey) parts.push(`session=${ev.session_key ?? ev.sessionKey}`);
  if (ev.name) parts.push(`tool=${ev.name}`);
  if (ev.model) parts.push(`model=${ev.model}`);
  if (ev.status) parts.push(`status=${ev.status}`);
  if (parts.length > 0) return parts.join(' · ');
  const { ts, event, origin, channel, ...rest } = ev;
  void ts;
  void event;
  void origin;
  void channel;
  try {
    return JSON.stringify(rest);
  } catch {
    return '';
  }
}

export default function AgentAuditPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [windowKey, setWindowKey] = useState<WindowKey>('1h');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<AuditSelection | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('');
  const [laneFilter, setLaneFilter] = useState<string>('');
  // Default-hide noisy api_request lines — users can opt back in via checkbox.
  const [showApiRequests, setShowApiRequests] = useState(false);

  // Server-side sort — mapped to the audit API ``sortBy`` column whitelist.
  // Frontend column key → backend column name.
  const SORT_COLUMN: Record<string, string> = useMemo(
    () => ({
      time: 'ts',
      event: 'event',
      lane: 'channel',
      model: 'model',
      status: 'status',
    }),
    [],
  );
  const [sortKey, setSortKey] = useState<string>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const windowMs = WINDOWS[windowKey].ms;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const nowMs = Date.now();
    const fromIso = new Date(nowMs - windowMs).toISOString();
    const backendCol = SORT_COLUMN[sortKey] ?? 'ts';
    const params = new URLSearchParams({
      from: fromIso,
      limit: '500',
      sortBy: backendCol,
      sortDir,
    });
    try {
      const data = await manageApi<ListResponse>(agentId, `audit?${params.toString()}`);
      setEvents(Array.isArray(data.items) ? data.items : []);
      setNow(nowMs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, windowMs, sortKey, sortDir, SORT_COLUMN]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => events.map(toRow), [events]);

  const eventTypes = useMemo(() => Array.from(new Set(rows.map((r) => r.event))).sort(), [rows]);
  const lanes = useMemo(() => Array.from(new Set(rows.map((r) => r.lane))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showApiRequests && r.event === 'api_request') return false;
      if (eventFilter && r.event !== eventFilter) return false;
      if (laneFilter && r.lane !== laneFilter) return false;
      if (selection) {
        const from = Date.parse(selection.from);
        const to = Date.parse(selection.to);
        if (r.lane !== selection.lane) return false;
        if (!(r.ts >= from && r.ts <= to)) return false;
      }
      if (q) {
        const hay = `${r.event} ${r.lane} ${r.model} ${r.status} ${r.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, eventFilter, laneFilter, selection, showApiRequests]);

  const columns: ManageTableColumn<AuditRow>[] = useMemo(
    () => [
      {
        key: 'time',
        header: 'Time',
        className: 'w-28 text-muted-foreground tabular-nums',
        sort: (a, b) => a.ts - b.ts,
        cell: (r) => r.timeLabel,
      },
      {
        key: 'event',
        header: 'Event',
        className: 'font-medium',
        sort: (a, b) => a.event.localeCompare(b.event),
        cell: (r) => <span className="text-foreground">{r.event}</span>,
      },
      {
        key: 'lane',
        header: 'Lane',
        hideOnMobile: true,
        className: 'w-32',
        sort: (a, b) => a.lane.localeCompare(b.lane),
        cell: (r) => {
          const color = getAvatarColor(r.lane);
          return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-sm font-medium text-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              {r.lane}
            </span>
          );
        },
      },
      {
        key: 'model',
        header: 'Model',
        hideOnMobile: true,
        className: 'w-40 text-sm text-muted-foreground',
        sort: (a, b) => a.model.localeCompare(b.model),
        cell: (r) => <span className="truncate block">{r.model || '—'}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        hideOnMobile: true,
        className: 'w-28',
        sort: (a, b) => a.status.localeCompare(b.status),
        cell: (r) =>
          r.status ? (
            <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-sm font-normal text-foreground">
              {r.status}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  const hasActiveFilters = !!search || !!eventFilter || !!laneFilter || !!selection;

  return (
    <ManagePane
      title="Audit log"
      backHref="/manage"
      subtitle="Run-level events: tool calls, channel activity, cron, LLM usage"
      actions={
        <div className="flex items-center gap-2">
          <PillSwitch<WindowKey>
            value={windowKey}
            onChange={setWindowKey}
            aria-label="Time window"
            options={(Object.keys(WINDOWS) as WindowKey[]).map((k) => ({
              value: k,
              label: WINDOWS[k].label,
            }))}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </Button>
        </div>
      }
    >
      <ManageSection
        title="Timeline"
        actions={
          selection && (
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <X size={12} /> Clear selection
            </button>
          )
        }
      >
        <AuditTimeline
          events={events}
          windowMs={windowMs}
          now={now}
          onSelect={setSelection}
          selected={selection}
        />
      </ManageSection>

      <ManageSection
        title={
          <span>
            Events
            <span className="ml-2 text-muted-foreground/80 font-normal normal-case tracking-normal">
              ({filtered.length}
              {filtered.length !== rows.length ? ` of ${rows.length}` : ''})
            </span>
          </span>
        }
      >
        <ManageCard flush>
          <div className="flex flex-wrap items-center gap-2 px-4 md:px-5 py-3 border-b border-border/50">
            <div className="relative flex-1 min-w-50">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                type="text"
                placeholder="Search events, models, tools…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm bg-muted border-transparent rounded-lg"
              />
            </div>
            <FilterSelect
              value={eventFilter}
              onChange={setEventFilter}
              placeholder="All events"
              options={eventTypes}
              width="w-[150px]"
            />
            <FilterSelect
              value={laneFilter}
              onChange={setLaneFilter}
              placeholder="All lanes"
              options={lanes}
              width="w-[140px]"
            />
            <label className="inline-flex items-center gap-1.5 px-2 h-8 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showApiRequests}
                onChange={(e) => setShowApiRequests(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-foreground"
              />
              Show API requests
            </label>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => {
                  setSearch('');
                  setEventFilter('');
                  setLaneFilter('');
                  setSelection(null);
                }}
              >
                <X size={14} /> Clear
              </Button>
            )}
          </div>

          {error && (
            <p className="px-4 md:px-5 py-3 text-sm text-destructive">
              Failed to load audit log: {error}
            </p>
          )}

          <ManageDataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.key}
            pageSize={25}
            controlledSort={{ key: sortKey, dir: sortDir }}
            onSortChange={(key, dir) => {
              setSortKey(key);
              setSortDir(dir);
            }}
            loading={loading}
            expandedContent={(r) => <AuditDetail row={r} />}
            emptyText={
              loading
                ? 'Loading events…'
                : hasActiveFilters
                  ? 'No events match the current filters.'
                  : 'No events in the selected window.'
            }
          />
        </ManageCard>
      </ManageSection>
    </ManagePane>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  width?: string;
}) {
  // Base-ui Select uses an explicit sentinel for the "no selection" state.
  const ALL = '__all__';
  return (
    <Select
      value={value === '' ? ALL : value}
      onValueChange={(v) => onChange(v === ALL ? '' : (v ?? ''))}
    >
      <SelectTrigger className={cn('h-8 rounded-lg bg-muted border-transparent text-sm', width)}>
        <SelectValue placeholder={placeholder}>
          {(val: string | null) => (!val || val === ALL ? placeholder : val)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AuditDetail({ row }: { row: AuditRow }) {
  const ev = row.raw;
  const fields: { label: string; value: string | undefined }[] = [
    { label: 'Run', value: (ev.run_id as string) ?? (ev.runId as string) },
    {
      label: 'Session',
      value: (ev.session_key as string) ?? (ev.sessionKey as string),
    },
    { label: 'Tool', value: ev.name as string | undefined },
    { label: 'Model', value: ev.model as string | undefined },
    { label: 'Status', value: ev.status as string | undefined },
    { label: 'Channel', value: ev.channel as string | undefined },
    { label: 'Origin', value: ev.origin as string | undefined },
  ].filter((f) => !!f.value);

  let json = '';
  try {
    json = JSON.stringify(ev, null, 2);
  } catch {
    json = '';
  }

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 md:grid-cols-4">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="truncate font-mono text-foreground" title={f.value}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {json && (
        <pre className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-foreground">
          {json}
        </pre>
      )}
    </div>
  );
}
