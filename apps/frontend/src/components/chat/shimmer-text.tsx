'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ShimmerTextProps {
  text: string;
  className?: string;
}

/**
 * Minimal status text with a gentle breathing opacity pulse
 * and sequentially animated trailing dots.
 */
export const ShimmerText = memo(function ShimmerText({ text, className }: ShimmerTextProps) {
  if (!text) return null;

  return (
    <span className={cn('status-text', className)} aria-label={text}>
      {text}
      <span className="status-dots" aria-hidden="true">
        <span className="status-dot" />
        <span className="status-dot" />
        <span className="status-dot" />
      </span>
    </span>
  );
});
