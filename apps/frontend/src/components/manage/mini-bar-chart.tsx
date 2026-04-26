import { getAvatarColor } from '@/lib/avatar';
import { formatCompactNumber } from '@/lib/format-number';
import { cn } from '@/lib/utils';

export interface BarDatum {
  /** Label rendered next to the bar. */
  label: string;
  /** Raw numeric value (>= 0). */
  value: number;
  /** Optional explicit color override (hex). Defaults to `getAvatarColor(label)`. */
  color?: string;
}

interface MiniBarChartProps {
  data: BarDatum[];
  className?: string;
  /** Max value used for scaling. Defaults to `Math.max(...values)`. */
  max?: number;
  /** Optional empty-state message. */
  emptyText?: string;
  /** Height per bar in pixels. */
  barHeight?: number;
  /** Value formatter; defaults to a compact (k/M) representation. */
  format?: (value: number) => string;
}

/**
 * Minimalist horizontal bar chart — pure SVG-free; built with rounded divs.
 *
 * Matches the Placet card aesthetic: muted palette (pulled from the chat
 * avatar color set) and rounded-full bars. No chart library dependency.
 */
export function MiniBarChart({
  data,
  className,
  max,
  emptyText = 'No data',
  barHeight = 10,
  format = (v) => formatCompactNumber(v),
}: MiniBarChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground italic py-4', className)}>{emptyText}</div>
    );
  }

  const computedMax = max ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn('space-y-2.5', className)}>
      {data.map((d) => {
        const pct = computedMax > 0 ? (d.value / computedMax) * 100 : 0;
        const color = d.color ?? getAvatarColor(d.label);
        return (
          <div key={d.label} className="flex items-center gap-3">
            <span className="min-w-0 w-28 shrink-0 truncate text-sm text-muted-foreground">
              {d.label}
            </span>
            <div className="flex-1 min-w-0 rounded-full bg-muted/60 overflow-hidden">
              <div
                className="rounded-full transition-[width] duration-300"
                style={{
                  width: `${pct}%`,
                  height: barHeight,
                  backgroundColor: color,
                }}
              />
            </div>
            <span className="shrink-0 w-14 text-right text-sm font-medium tabular-nums text-foreground">
              {format(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
