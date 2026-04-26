'use client';

import { useMemo, useState } from 'react';
import { getAvatarColor } from '@/lib/avatar';
import { formatCompactNumber, formatFullNumber } from '@/lib/format-number';
import { cn } from '@/lib/utils';

export interface StackedAgentSeries {
  id: string;
  name: string;
  byDate: Record<string, number>;
  total: number;
  color?: string;
}

interface StackedDailyBarChartProps {
  days: string[];
  series: StackedAgentSeries[];
  totals: Record<string, number>;
  className?: string;
  height?: number;
  emptyText?: string;
}

/**
 * Stacked bar chart: one bar per day, each bar subdivided by agent. Pure
 * HTML/CSS (no chart library). The agent colors come from `getAvatarColor`
 * unless overridden, matching the avatar palette used elsewhere.
 *
 * Layout: a left gutter holds the y-axis labels (max / mid / 0); the chart
 * area renders the bars on top of three faint gridlines plus a 1 px baseline.
 * The hover tooltip is positioned inside the chart's reserved header strip
 * so it never escapes the surrounding card.
 */
export function StackedDailyBarChart({
  days,
  series,
  totals,
  className,
  height = 160,
  emptyText = 'No token usage recorded in this window.',
}: StackedDailyBarChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const max = useMemo(() => Math.max(1, ...days.map((d) => totals[d] ?? 0)), [days, totals]);

  const totalAll = useMemo(() => series.reduce((acc, s) => acc + s.total, 0), [series]);

  const resolved = useMemo(
    () => series.map((s) => ({ ...s, color: s.color ?? getAvatarColor(s.name) })),
    [series],
  );

  if (totalAll === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground italic py-8 text-center', className)}>
        {emptyText}
      </div>
    );
  }

  const formatDay = (iso: string) => {
    // iso is YYYY-MM-DD — show as Mon DD in user locale.
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const hoverDate = hoverIndex !== null ? days[hoverIndex] : null;
  const hoverTotal = hoverDate !== null ? (totals[hoverDate] ?? 0) : 0;
  // Anchor tooltip to the centre of the hovered column.
  const tooltipLeftPct =
    hoverIndex !== null && days.length > 0 ? ((hoverIndex + 0.5) / days.length) * 100 : 0;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex gap-2" onMouseLeave={() => setHoverIndex(null)}>
        {/* Y-axis labels */}
        <div
          className="relative shrink-0 w-10 text-right text-[10px] tabular-nums text-muted-foreground select-none"
          style={{ height: height + 32 /* matches chart wrapper incl. tooltip strip */ }}
        >
          {/* Top of bars area is offset by the tooltip strip (h-8). */}
          <span className="absolute right-0 top-8 -translate-y-1/2">
            {formatCompactNumber(max)}
          </span>
          <span className="absolute right-0 top-1/2 translate-y-[calc(8px-50%)]">
            {formatCompactNumber(max / 2)}
          </span>
          <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
        </div>

        {/* Chart area */}
        <div className="relative flex-1 min-w-0">
          {/* Tooltip strip — reserved space above the bars so the popover
              never gets clipped by the card or the page header. */}
          <div className="relative h-8">
            {hoverDate && hoverTotal > 0 && (
              <div
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/60 bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md"
                style={{ left: `${tooltipLeftPct}%` }}
              >
                <div className="font-medium leading-tight">{formatDay(hoverDate)}</div>
                <div className="text-xs text-muted-foreground leading-tight">
                  {formatFullNumber(hoverTotal)} tokens
                </div>
              </div>
            )}
          </div>

          {/* Plot area */}
          <div className="relative" style={{ height }}>
            {/* Gridlines (max / 50% / 0) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border/40" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/40" />
            {/* Solid baseline at zero */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border/70" />

            <div className="flex items-end gap-1 w-full h-full">
              {days.map((d, i) => {
                const dayTotal = totals[d] ?? 0;
                const pct = max > 0 ? (dayTotal / max) * 100 : 0;
                const isHover = hoverIndex === i;
                return (
                  <div
                    key={d}
                    className="relative flex-1 min-w-0 flex flex-col justify-end h-full group"
                    onMouseEnter={() => setHoverIndex(i)}
                  >
                    {/* Empty-day baseline marker — thin grey bar at the
                        zero line so days without activity are still visible. */}
                    {dayTotal === 0 && (
                      <div
                        aria-hidden
                        className="w-full bg-muted-foreground/25 rounded-sm"
                        style={{ height: 2 }}
                      />
                    )}

                    {dayTotal > 0 && (
                      <div
                        className={cn(
                          'w-full rounded-t-sm overflow-hidden flex flex-col-reverse transition-opacity',
                          hoverIndex !== null && !isHover && 'opacity-60',
                        )}
                        style={{ height: `${pct}%`, minHeight: 2 }}
                      >
                        {resolved.map((s) => {
                          const v = s.byDate[d] ?? 0;
                          if (v <= 0) return null;
                          const segPct = dayTotal > 0 ? (v / dayTotal) * 100 : 0;
                          return (
                            <div
                              key={s.id}
                              style={{ height: `${segPct}%`, backgroundColor: s.color }}
                              title={`${s.name}: ${formatFullNumber(v)}`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* X axis — show first, middle, last label to avoid clutter. */}
      <div className="flex justify-between text-sm text-muted-foreground tabular-nums pl-12">
        <span>{days.length > 0 ? formatDay(days[0]) : ''}</span>
        {days.length > 2 && <span>{formatDay(days[Math.floor(days.length / 2)])}</span>}
        <span>{days.length > 0 ? formatDay(days[days.length - 1]) : ''}</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pl-12">
        {resolved.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-foreground">{s.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatCompactNumber(s.total)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
