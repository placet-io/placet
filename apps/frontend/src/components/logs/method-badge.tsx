'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface MethodBadgeProps {
  method: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-500 dark:text-blue-400',
  POST: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400',
  PUT: 'bg-amber-500/10 text-amber-500 dark:text-amber-400',
  PATCH: 'bg-amber-500/10 text-amber-500 dark:text-amber-400',
  DELETE: 'bg-red-500/10 text-red-500 dark:text-red-400',
};

export const MethodBadge = memo(function MethodBadge({ method }: MethodBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-14 items-center justify-center rounded-md px-2.5 py-1 text-xs font-bold',
        METHOD_COLORS[method] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {method}
    </span>
  );
});
