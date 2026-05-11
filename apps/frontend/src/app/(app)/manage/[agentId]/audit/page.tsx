'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, X, RefreshCw, Search } from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import {
  AuditTimeline,
  getAuditLane,
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
  runId: string;
  event: string;
  toolName: string;
  mcpServer: string;
  lane: string;
  model: string;
  status: string;
  summary: string;
  raw: AuditEvent;
}

type CorrelationFilterKey = 'traceId' | 'turnId' | 'parentRunId' | 'channelId';
type CorrelationFilters = Partial<Record<CorrelationFilterKey, string>>;
type AuditDetailField = {
  label: string;
  value: string | undefined;
  filterKey?: CorrelationFilterKey;
};

const CORRELATION_LABELS: Record<CorrelationFilterKey, string> = {
  traceId: 'Trace',
  turnId: 'Turn',
  parentRunId: 'Parent',
  channelId: 'Channel ID',
};

function getEventString(ev: AuditEvent, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = ev[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function toRow(ev: AuditEvent, i: number): AuditRow {
  const ts = ev.ts ? Date.parse(ev.ts) : NaN;
  const toolName = getToolName(ev) ?? '';
  const mcpServer = getMcpServerName(toolName) ?? '';
  const timeLabel = Number.isFinite(ts)
    ? new Date(ts).toLocaleTimeString(undefined, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
  return {
    key: `${ev.ts ?? ''}-${i}`,
    ts: Number.isFinite(ts) ? ts : 0,
    timeLabel,
    runId: getEventString(ev, 'run_id', 'runId') ?? '',
    event: mcpServer && ev.event === 'tool_call' ? 'mcp_call' : ((ev.event as string) ?? 'event'),
    toolName,
    mcpServer,
    lane: getAuditLane(ev),
    model: (ev.model as string | undefined) ?? '',
    status: (ev.status as string | undefined) ?? '',
    summary: summarize(ev),
    raw: ev,
  };
}

function getToolName(ev: AuditEvent): string | undefined {
  return getEventString(ev, 'tool_name', 'toolName', 'name');
}

function isMcpToolName(toolName: string): boolean {
  return /^mcp[:_]/i.test(toolName);
}

function getMcpServerName(toolName: string): string | undefined {
  if (!isMcpToolName(toolName)) return undefined;
  if (toolName.includes(':')) {
    const [, server] = toolName.split(':');
    return server || undefined;
  }
  const match = /^mcp_([^_]+)_/.exec(toolName);
  return match?.[1];
}

function getEventContext(row: AuditRow): string | undefined {
  if (row.mcpServer) return row.mcpServer;
  if (row.toolName) return row.toolName;
  return row.model || undefined;
}

function getEventTone(row: AuditRow): 'default' | 'tool' | 'mcp' {
  if (row.event === 'mcp_call' || row.mcpServer) return 'mcp';
  if (row.event === 'tool_call' || row.toolName) return 'tool';
  return 'default';
}

function summarize(ev: AuditEvent): string {
  const parts: string[] = [];
  const runId = getEventString(ev, 'run_id', 'runId');
  const traceId = getEventString(ev, 'trace_id', 'traceId');
  const turnId = getEventString(ev, 'turn_id', 'turnId');
  const parentRunId = getEventString(ev, 'parent_run_id', 'parentRunId');
  const sessionKey = getEventString(ev, 'session_key', 'sessionKey');
  if (runId) parts.push(`run=${runId}`);
  if (traceId) parts.push(`trace=${traceId}`);
  if (turnId) parts.push(`turn=${turnId}`);
  if (parentRunId) parts.push(`parent=${parentRunId}`);
  if (sessionKey) parts.push(`session=${sessionKey}`);
  const toolName = getToolName(ev);
  if (toolName) {
    const serverName = getMcpServerName(toolName);
    parts.push(serverName ? `mcp=${serverName}` : `tool=${toolName}`);
  }
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Debounce the search filter — typing in the input refilters every keystroke
  // over up to 500 audit rows, which is noticeable on slower devices.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 150);
    return () => window.clearTimeout(handle);
  }, [search]);
  const [eventFilter, setEventFilter] = useState<string>('');
  const [laneFilter, setLaneFilter] = useState<string>('');
  const [correlationFilters, setCorrelationFilters] = useState<CorrelationFilters>({});
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
    for (const key of Object.keys(CORRELATION_LABELS) as CorrelationFilterKey[]) {
      const value = correlationFilters[key];
      if (value) params.set(key, value);
    }
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
  }, [agentId, windowMs, sortKey, sortDir, SORT_COLUMN, correlationFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      events.map((e, i) => {
        const r = toRow(e, i);
        // Precompute the lowercase search haystack once per row so the
        // debounced search filter doesn't rebuild it on every keystroke.
        const _haystack =
          `${r.timeLabel} ${r.runId} ${r.event} ${r.toolName} ${r.mcpServer} ${r.lane} ${r.model} ${r.status} ${r.summary}`.toLowerCase();
        return { ...r, _haystack };
      }),
    [events],
  );

  const eventTypes = useMemo(() => Array.from(new Set(rows.map((r) => r.event))).sort(), [rows]);
  const lanes = useMemo(() => Array.from(new Set(rows.map((r) => r.lane))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
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
      if (q && !r._haystack.includes(q)) return false;
      return true;
    });
  }, [rows, debouncedSearch, eventFilter, laneFilter, selection, showApiRequests]);

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
        key: 'run',
        header: 'Run',
        hideOnMobile: true,
        className: 'w-32 text-muted-foreground',
        cell: (r) => (
          <span className="block truncate font-mono text-sm" title={r.runId || undefined}>
            {r.runId ? shortId(r.runId) : '—'}
          </span>
        ),
      },
      {
        key: 'event',
        header: 'Event',
        className: 'font-medium min-w-56',
        sort: (a, b) => a.event.localeCompare(b.event),
        cell: (r) => <EventCell row={r} />,
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

  const activeCorrelationFilters = Object.entries(correlationFilters).filter(
    (entry): entry is [CorrelationFilterKey, string] => Boolean(entry[1]),
  );
  const hasActiveFilters =
    !!search || !!eventFilter || !!laneFilter || !!selection || activeCorrelationFilters.length > 0;

  const setCorrelationFilter = useCallback((key: CorrelationFilterKey, value: string) => {
    setCorrelationFilters((current) => ({ ...current, [key]: value }));
    setSelection(null);
  }, []);

  const clearCorrelationFilter = useCallback((key: CorrelationFilterKey) => {
    setCorrelationFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

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
            {activeCorrelationFilters.map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => clearCorrelationFilter(key)}
                title={`${CORRELATION_LABELS[key]}: ${value}`}
                className="inline-flex h-8 max-w-48 items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-2 text-sm text-foreground hover:bg-muted/80"
              >
                <span className="text-muted-foreground">{CORRELATION_LABELS[key]}</span>
                <span className="truncate font-mono">{shortId(value)}</span>
                <X size={12} className="shrink-0 text-muted-foreground" />
              </button>
            ))}
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
                  setCorrelationFilters({});
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
            expandedContent={(r) => <AuditDetail row={r} onFilter={setCorrelationFilter} />}
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

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...`;
}

function EventCell({ row }: { row: AuditRow }) {
  const context = getEventContext(row);
  const tone = getEventTone(row);
  return (
    <div
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-1',
        tone === 'mcp' &&
          'border-sky-500/25 bg-sky-500/10 text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-100',
        tone === 'tool' &&
          'border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100',
        tone === 'default' && 'border-transparent text-foreground',
      )}
      title={context ? `${row.event} (${context})` : row.event}
    >
      <span className="shrink-0 truncate">{row.event}</span>
      {context && (
        <span className="min-w-0 truncate font-mono text-sm opacity-80">({context})</span>
      )}
    </div>
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

function AuditDetail({
  row,
  onFilter,
}: {
  row: AuditRow;
  onFilter: (key: CorrelationFilterKey, value: string) => void;
}) {
  const ev = row.raw;
  const allFields: AuditDetailField[] = [
    { label: 'Run', value: getEventString(ev, 'run_id', 'runId') },
    { label: 'Trace', value: getEventString(ev, 'trace_id', 'traceId'), filterKey: 'traceId' },
    { label: 'Turn', value: getEventString(ev, 'turn_id', 'turnId'), filterKey: 'turnId' },
    {
      label: 'Parent Run',
      value: getEventString(ev, 'parent_run_id', 'parentRunId'),
      filterKey: 'parentRunId',
    },
    {
      label: 'Session',
      value: getEventString(ev, 'session_key', 'sessionKey'),
    },
    { label: 'Tool', value: getToolName(ev) },
    { label: 'MCP Server', value: getMcpServerName(getToolName(ev) ?? '') },
    {
      label: 'Tool Type',
      value: getToolName(ev) ? (isMcpToolName(getToolName(ev)!) ? 'MCP' : 'Tool') : undefined,
    },
    { label: 'Model', value: ev.model as string | undefined },
    { label: 'Status', value: ev.status as string | undefined },
    { label: 'Channel', value: ev.channel as string | undefined },
    {
      label: 'Channel ID',
      value: getEventString(ev, 'channel_id', 'channelId'),
      filterKey: 'channelId',
    },
    { label: 'Origin', value: ev.origin as string | undefined },
  ];
  const fields = allFields.filter((field) => !!field.value);

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
              <dd className="flex min-w-0 items-center gap-2" title={f.value}>
                <span className="truncate font-mono text-foreground">{f.value}</span>
                {f.filterKey && f.value && (
                  <button
                    type="button"
                    onClick={() => {
                      if (f.filterKey && f.value) onFilter(f.filterKey, f.value);
                    }}
                    className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Filter
                  </button>
                )}
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
