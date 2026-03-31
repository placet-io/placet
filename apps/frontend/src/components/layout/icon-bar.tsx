'use client';

import { memo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Inbox, Folder, Terminal, Activity, Settings } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
const NAV_ITEMS = [
  { href: '/chats', icon: MessageSquare, label: 'Agents' },
  { href: '/inbox', icon: Inbox, label: 'Inbox' },
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
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  isActive: boolean;
  badge?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            className={cn(
              'relative flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl transition-all',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          />
        }
      >
        <Icon size={20} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
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
        <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-primary shadow-sm">
          <img src="/logo-white.svg" alt="Placet" className="h-6 w-6 md:h-7 md:w-7 dark:hidden" />
          <img
            src="/logo-black.svg"
            alt="Placet"
            className="h-6 w-6 md:h-7 md:w-7 hidden dark:block"
          />
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
