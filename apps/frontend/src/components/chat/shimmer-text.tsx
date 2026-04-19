'use client';

import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShimmerTextProps {
  text: string;
  className?: string;
}

/**
 * Status text with a small spinning loader in primary color.
 */
export const ShimmerText = memo(function ShimmerText({ text, className }: ShimmerTextProps) {
  if (!text) return null;

  return (
    <span
      className={cn('inline-flex items-center gap-2 text-primary', className)}
      aria-label={text}
    >
      <Loader2 size={14} className="animate-spin" />
      {text}
    </span>
  );
});
