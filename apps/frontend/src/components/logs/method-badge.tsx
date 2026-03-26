'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface MethodBadgeProps {
  method: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-info-muted text-info-foreground',
  POST: 'bg-success-muted text-success-foreground',
  PUT: 'bg-warning-muted text-warning-foreground',
  PATCH: 'bg-warning-muted text-warning-foreground',
  DELETE: 'bg-error-muted text-error-foreground',
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
