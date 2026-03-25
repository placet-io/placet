'use client';

import { memo } from 'react';
import { CheckCircle2, Shield, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogStatusBadgeProps {
  status: number;
}

function statusColor(status: number) {
  if (status >= 200 && status < 300) return 'text-emerald-600 dark:text-emerald-400';
  if (status >= 400 && status < 500) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export const LogStatusBadge = memo(function LogStatusBadge({ status }: LogStatusBadgeProps) {
  const icon =
    status >= 200 && status < 300 ? (
      <CheckCircle2 size={16} className="text-emerald-500" />
    ) : status === 401 || status === 403 ? (
      <Shield size={16} className="text-orange-500" />
    ) : (
      <XCircle size={16} className="text-red-500" />
    );

  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className={cn('text-sm font-medium', statusColor(status))}>{status}</span>
    </span>
  );
});
