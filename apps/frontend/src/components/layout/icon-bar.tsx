'use client';

import { memo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bot, MessageSquare, Folder, Terminal, Activity, Settings } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/chats', icon: MessageSquare, label: 'Agents' },
  { href: '/files', icon: Folder, label: 'Files' },
  { href: '/logs', icon: Terminal, label: 'Logs' },
  { href: '/status', icon: Activity, label: 'Status' },
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const;

function NavIcon({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  isActive: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            className={cn(
              'flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl transition-all',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          />
        }
      >
        <Icon size={20} />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export const IconBar = memo(function IconBar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-16 md:w-20 shrink-0 flex-col items-center bg-card rounded-3xl py-6 shadow-sm border border-border/50">
      {/* Logo */}
      <div className="mb-8">
        <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Bot size={24} />
        </div>
      </div>

      {/* Nav items */}
      <div className="flex flex-1 w-full flex-col items-center gap-4">
        {NAV_ITEMS.map(({ href, icon, label }) => (
          <NavIcon
            key={href}
            href={href}
            icon={icon}
            label={label}
            isActive={pathname === href || pathname.startsWith(`${href}/`)}
          />
        ))}
      </div>
    </nav>
  );
});
