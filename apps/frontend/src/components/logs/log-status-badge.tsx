'use client';

import { memo } from 'react';
import { CheckCircle2, Shield, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogStatusBadgeProps {
  status: number;
}

function statusColor(status: number) {
  if (status >= 200 && status < 300) return 'text-success-foreground';
  if (status >= 400 && status < 500) return 'text-warning-foreground';
  return 'text-error-foreground';
}

export const LogStatusBadge = memo(function LogStatusBadge({ status }: LogStatusBadgeProps) {
  const icon =
    status >= 200 && status < 300 ? (
      <CheckCircle2 size={16} className="text-success-foreground" />
    ) : status === 401 || status === 403 ? (
      <Shield size={16} className="text-warning-foreground" />
    ) : (
      <XCircle size={16} className="text-error-foreground" />
    );

  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className={cn('text-sm font-medium', statusColor(status))}>{status}</span>
    </span>
  );
});
