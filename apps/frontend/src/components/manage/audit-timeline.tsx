'use client';

import { useMemo, useState } from 'react';
import { getAvatarColor } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export interface AuditEvent {
  ts?: string;
  event?: string;
  origin?: string;
  channel?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export interface AuditSelection {
  /** Lane key that was clicked (channel name, cron, api…). */
  lane: string;
  /** ISO timestamp of the cluster start. */
  from: string;
  /** ISO timestamp of the cluster end. */
  to: string;
}

interface AuditTimelineProps {
  events: AuditEvent[];
  /** Full window in milliseconds (e.g. 60 * 60 * 1000 = 1h). */
  windowMs: number;
  /** Anchor "now" — defaults to Date.now(). */
  now?: number;
  onSelect?: (selection: AuditSelection) => void;
  selected?: AuditSelection | null;
  className?: string;
}

const LANE_HEIGHT = 20; // px
const LANE_GAP = 6; // px
const MIN_BAR_WIDTH_PCT = 0.6; // % — so a single point is still clickable
const CLUSTER_GAP_RATIO = 1 / 120; // merge events closer than 1/120th of window

/**
 * Horizontal stacked timeline: one lane per (channel | origin | "other") with
 * coloured clusters representing audit event bursts. Rightmost edge = now;
 * clicking a cluster fires `onSelect` with lane + time range so the log
 * table below can filter accordingly.
 */
export function AuditTimeline({
  events,
  windowMs,
  now,
  onSelect,
  selected,
  className,
}: AuditTimelineProps) {
  // `Date.now()` is impure during render, so we capture a stable fallback
  // anchor at mount via `useState`'s lazy initializer. Callers that pass
  // an explicit `now` (the audit page does) override this on every tick.
  const [fallbackNow] = useState(() => Date.now());
  const anchor = now ?? fallbackNow;
  const start = anchor - windowMs;

  // Group events by lane key. Prefer `channel`, fall back to `origin`.
  const lanes = useMemo(() => {
    const byLane = new Map<string, AuditEvent[]>();
    for (const ev of events) {
      const ts = ev.ts ? Date.parse(ev.ts) : NaN;
      if (!Number.isFinite(ts) || ts < start || ts > anchor) continue;
      const lane = (ev.channel || ev.origin || 'other') as string;
      if (!byLane.has(lane)) byLane.set(lane, []);
      byLane.get(lane)!.push(ev);
    }
    // Sort lanes alphabetically; events within a lane by ts ASC.
    const sorted = Array.from(byLane.entries())
      .map(([lane, items]) => ({
        lane,
        items: items
          .map((e) => ({ ...e, _ts: Date.parse(e.ts ?? '') }))
          .sort((a, b) => a._ts - b._ts),
      }))
      .sort((a, b) => a.lane.localeCompare(b.lane));
    return sorted;
  }, [events, anchor, start]);

  const totalHeight = lanes.length * (LANE_HEIGHT + LANE_GAP);

  // Render time ticks (4 equally-spaced labels).
  const ticks = useMemo(() => {
    const out: { pct: number; label: string }[] = [];
    for (let i = 0; i <= 4; i++) {
      const pct = (i / 4) * 100;
      const tMs = start + (windowMs * i) / 4;
      out.push({ pct, label: formatAgo(anchor - tMs) });
    }
    return out;
  }, [anchor, start, windowMs]);

  if (lanes.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-20 rounded-xl border border-dashed border-border/60 bg-muted/10 text-sm text-muted-foreground',
          className,
        )}
      >
        No events in the selected window.
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Timeline grid */}
      <div className="rounded-2xl border border-border/50 bg-card shadow-xs p-4 pr-6">
        <div className="flex gap-3">
          {/* Lane labels */}
          <div className="shrink-0 flex flex-col gap-1.5 pt-0.5" style={{ width: 120 }}>
            {lanes.map(({ lane }) => (
              <div
                key={lane}
                style={{ height: LANE_HEIGHT }}
                className="flex items-center gap-2 text-sm text-muted-foreground truncate"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getAvatarColor(lane) }}
                />
                <span className="truncate">{lane}</span>
              </div>
            ))}
          </div>

          {/* Lanes */}
          <div className="flex-1 min-w-0 relative" style={{ height: totalHeight }}>
            {/* Vertical tick lines */}
            {ticks.map((t) => (
              <div
                key={t.pct}
                className="absolute top-0 bottom-0 border-l border-border/40"
                style={{ left: `${t.pct}%` }}
              />
            ))}
            {/* Bars */}
            {lanes.map(({ lane, items }, laneIdx) => {
              const clusters = clusterEvents(items, windowMs * CLUSTER_GAP_RATIO);
              const color = getAvatarColor(lane);
              return clusters.map((c, i) => {
                const fromPct = Math.max(0, ((c.from - start) / windowMs) * 100);
                const width = Math.max(MIN_BAR_WIDTH_PCT, ((c.to - c.from) / windowMs) * 100);
                const isSelected =
                  selected?.lane === lane &&
                  selected.from === new Date(c.from).toISOString() &&
                  selected.to === new Date(c.to).toISOString();
                return (
                  <button
                    key={`${lane}-${i}`}
                    type="button"
                    title={`${lane} · ${c.count} event${c.count === 1 ? '' : 's'}`}
                    onClick={() =>
                      onSelect?.({
                        lane,
                        from: new Date(c.from).toISOString(),
                        to: new Date(c.to).toISOString(),
                      })
                    }
                    className={cn(
                      'absolute rounded-full transition-all hover:opacity-90 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring',
                      isSelected && 'ring-2 ring-primary',
                    )}
                    style={{
                      top: laneIdx * (LANE_HEIGHT + LANE_GAP) + 4,
                      height: LANE_HEIGHT - 8,
                      left: `${fromPct}%`,
                      width: `${width}%`,
                      backgroundColor: color,
                      opacity: Math.min(1, 0.5 + c.count * 0.1),
                    }}
                  />
                );
              });
            })}
          </div>
        </div>

        {/* Tick labels */}
        <div className="flex gap-3 mt-2">
          <div style={{ width: 120 }} />
          <div className="flex-1 relative h-4">
            {ticks.map((t) => {
              const atEnd = t.pct >= 100;
              const atStart = t.pct <= 0;
              return (
                <span
                  key={t.pct}
                  className={cn(
                    'absolute text-sm text-muted-foreground',
                    atEnd ? '-translate-x-full' : atStart ? '' : '-translate-x-1/2',
                  )}
                  style={{ left: `${t.pct}%` }}
                >
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function clusterEvents(
  items: Array<AuditEvent & { _ts: number }>,
  gapMs: number,
): Array<{ from: number; to: number; count: number }> {
  if (items.length === 0) return [];
  const out: Array<{ from: number; to: number; count: number }> = [];
  let cur = { from: items[0]._ts, to: items[0]._ts, count: 1 };
  for (let i = 1; i < items.length; i++) {
    const ts = items[i]._ts;
    if (ts - cur.to <= gapMs) {
      cur.to = ts;
      cur.count++;
    } else {
      out.push(cur);
      cur = { from: ts, to: ts, count: 1 };
    }
  }
  out.push(cur);
  return out;
}

function formatAgo(ms: number): string {
  if (ms < 60_000) return 'now';
  const s = Math.round(ms / 1000);
  if (s < 3600) return `-${Math.round(s / 60)}m`;
  if (s < 86400) return `-${Math.round(s / 3600)}h`;
  return `-${Math.round(s / 86400)}d`;
}
