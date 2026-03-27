'use client';

import { memo, useCallback, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLogTime, formatShortDate } from '@/lib/format-date';
import { MethodBadge } from './method-badge';
import { LogStatusBadge } from './log-status-badge';
import { LogDetailPanel } from './log-detail-panel';
import type { ApiLog } from '@placet/shared';

interface LogRowProps {
  log: ApiLog;
}

export const LogRow = memo(function LogRow({ log }: LogRowProps) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const DirectionIcon = log.direction === 'inbound' ? ArrowDownLeft : ArrowUpRight;

  return (
    <>
      {/* Desktop row */}
      <tr
        className="hidden md:table-row hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={toggle}
      >
        <td className="px-6 py-3.5 text-muted-foreground whitespace-nowrap">
          <span className="text-xs">{formatShortDate(log.createdAt)}</span>{' '}
          {formatLogTime(log.createdAt)}
        </td>
        <td className="px-6 py-3.5">
          <MethodBadge method={log.method} />
        </td>
        <td className="px-6 py-3.5 font-mono text-foreground truncate max-w-[280px]">{log.path}</td>
        <td className="px-6 py-3.5">
          <LogStatusBadge status={log.statusCode} />
        </td>
        <td className="px-6 py-3.5 text-muted-foreground whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            <Clock size={14} />
            {log.durationMs}ms
          </span>
        </td>
        <td className="px-4 py-3.5 text-muted-foreground">
          <div className="flex items-center gap-2">
            <DirectionIcon size={14} className="shrink-0" />
            <ChevronDown
              size={14}
              className={cn('shrink-0 transition-transform', open && 'rotate-180')}
            />
          </div>
        </td>
      </tr>
      {/* Desktop expanded detail */}
      {open && (
        <tr className="hidden md:table-row bg-muted/20">
          <td colSpan={6} className="px-6 py-3">
            <LogDetailPanel log={log} />
          </td>
        </tr>
      )}

      {/* Mobile card */}
      <div className="md:hidden">
        <button
          type="button"
          className="w-full text-left bg-muted/30 rounded-xl border border-border p-4 space-y-2"
          onClick={toggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MethodBadge method={log.method} />
              <DirectionIcon size={14} className="text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <LogStatusBadge status={log.statusCode} />
              <ChevronDown
                size={14}
                className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
              />
            </div>
          </div>
          <p className="font-mono text-sm text-foreground truncate">{log.path}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatShortDate(log.createdAt)} {formatLogTime(log.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {log.durationMs}ms
            </span>
          </div>
        </button>
        {open && (
          <div className="mt-1 rounded-xl border border-border bg-muted/20 p-3">
            <LogDetailPanel log={log} />
          </div>
        )}
      </div>
    </>
  );
});
