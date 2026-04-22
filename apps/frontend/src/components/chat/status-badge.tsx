'use client';

import { memo, useEffect, useState } from 'react';
import type { AgentStatus } from '@placet/shared';
import { cn } from '@/lib/utils';

/**
 * Status freshness threshold: if the agent's last `statusSince` update was
 * more than this many milliseconds ago, we consider the live status "stale"
 * and switch the badge to a muted "last seen X ago" label instead.
 */
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

const STATUS_STYLES: Record<AgentStatus, { label: string; dot: string; pill: string }> = {
  active: {
    label: 'Active',
    dot: 'bg-success',
    // Pill styling is `sm+` only (mobile shows plain dot + muted text).
    pill: 'sm:bg-success-muted sm:text-success-foreground',
  },
  busy: {
    label: 'Busy',
    dot: 'bg-warning',
    pill: 'sm:bg-warning-muted sm:text-warning-foreground',
  },
  error: {
    label: 'Error',
    dot: 'bg-error',
    pill: 'sm:bg-error-muted sm:text-error-foreground',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-muted-foreground',
    pill: 'sm:bg-muted sm:text-muted-foreground',
  },
};

function formatAgo(diffMs: number): string {
  if (diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface StatusBadgeProps {
  status?: AgentStatus | null;
  statusSince?: string | null;
  className?: string;
}

/**
 * Compact status pill for the chat header.
 *
 * Rules (per product spec):
 * - No `statusSince` at all → render nothing (agent never reported status).
 * - Fresh (< {@link STALE_AFTER_MS}) → show live status label (Active / Busy / …).
 * - Stale → show muted "Last seen X ago".
 *
 * Implementation note: the "time ago" text is derived from `Date.now()` and
 * therefore differs between SSR and the client. To avoid React hydration
 * mismatches (#418) we render a neutral fallback on the server and fill in
 * the live label only after mount.
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  statusSince,
  className,
}: StatusBadgeProps) {
  const [mounted, setMounted] = useState(false);
  // `now` is updated inside effects only — keeping `Date.now()` out of the
  // render body satisfies the `react-hooks/purity` lint rule and prevents
  // non-deterministic renders.
  const [now, setNow] = useState(0);

  useEffect(() => {
    // Mount-gate + periodic re-render to keep "X ago" text current. The
    // setState calls here are intentional (we need to flip `mounted` and
    // seed `now` after hydration), so suppress the purity/set-state lint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // No status ever reported → render nothing.
  if (!statusSince) return null;

  const effectiveStatus: AgentStatus = status ?? 'offline';
  const styles = STATUS_STYLES[effectiveStatus] ?? STATUS_STYLES.offline;

  // Shared class strings:
  //   - Mobile: no pill background, muted small text with colored dot.
  //   - sm+:    coloured pill badge (original look).
  const badgeBase =
    'inline-flex items-center gap-1.5 shrink-0 text-[11px] sm:text-xs text-muted-foreground sm:font-medium sm:rounded-full sm:px-2 sm:py-0.5';

  // Server render: emit a stable, time-independent label to prevent
  // hydration mismatches. After mount we swap to the stale/recent variant.
  if (!mounted) {
    return (
      <span suppressHydrationWarning className={cn(badgeBase, styles.pill, className)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', styles.dot)} />
        {styles.label}
      </span>
    );
  }

  const diffMs = now - new Date(statusSince).getTime();
  const stale = diffMs >= STALE_AFTER_MS;

  if (stale) {
    return (
      <span
        suppressHydrationWarning
        className={cn(badgeBase, 'sm:bg-muted sm:text-muted-foreground', className)}
        title={`Last seen ${new Date(statusSince).toLocaleString()}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
        Last seen {formatAgo(diffMs)}
      </span>
    );
  }

  return (
    <span suppressHydrationWarning className={cn(badgeBase, styles.pill, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', styles.dot)} />
      {styles.label}
    </span>
  );
});
