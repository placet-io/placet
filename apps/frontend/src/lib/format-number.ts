/**
 * Compact integer/number formatter that keeps things readable on dashboards
 * without leaking 7- or 8-digit token counts into tile UI.
 *
 * Uses the user's locale via `Intl.NumberFormat({ notation: 'compact' })` so
 * en-US gets `60.5M`, de-DE gets `60,5 Mio.`, etc. Below 1_000 we keep the
 * raw integer (no suffix) since `compact` would otherwise emit awkward
 * three-digit values.
 */
const compactCache = new Map<string, Intl.NumberFormat>();

function getCompact(locale?: string): Intl.NumberFormat {
  const key = locale ?? '';
  let nf = compactCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    compactCache.set(key, nf);
  }
  return nf;
}

/**
 * Returns the value formatted with a SI-style suffix once it crosses 1 000.
 * `null` / `undefined` / non-finite become an em-dash for tile rendering.
 */
export function formatCompactNumber(
  n: number | null | undefined,
  options?: { locale?: string; emptyText?: string },
): string {
  const empty = options?.emptyText ?? '—';
  if (n === undefined || n === null || !Number.isFinite(n)) return empty;
  const abs = Math.abs(n);
  if (abs < 1_000) {
    // Keep small numbers as plain integers (no suffix), localized.
    return new Intl.NumberFormat(options?.locale).format(n);
  }
  return getCompact(options?.locale).format(n);
}

/**
 * Full-precision localized formatter for tooltips and detail rows where the
 * exact figure matters (e.g. "1,234,567 tokens").
 */
export function formatFullNumber(
  n: number | null | undefined,
  options?: { locale?: string; emptyText?: string },
): string {
  const empty = options?.emptyText ?? '—';
  if (n === undefined || n === null || !Number.isFinite(n)) return empty;
  return new Intl.NumberFormat(options?.locale).format(n);
}
