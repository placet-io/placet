'use client';

import { memo } from 'react';
import Image from 'next/image';
import { getAvatarColor, getInitials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

interface AgentAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const;

export const AgentAvatar = memo(function AgentAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
}: AgentAvatarProps) {
  const bg = getAvatarColor(name);
  const initials = getInitials(name);

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={48}
        height={48}
        unoptimized
        className={cn('shrink-0 rounded-full object-cover', SIZE_CLASSES[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        SIZE_CLASSES[size],
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      {initials}
    </div>
  );
});
