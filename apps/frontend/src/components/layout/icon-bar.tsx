'use client';

import { memo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Inbox, Folder, Terminal, Activity, Settings, Wrench } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePreferences } from '@/lib/hooks/use-preferences';
import { cn } from '@/lib/utils';
const NAV_ITEMS = [
  { href: '/chats', icon: MessageSquare, label: 'Agents' },
  { href: '/inbox', icon: Inbox, label: 'Inbox' },
  { href: '/files', icon: Folder, label: 'Files' },
  { href: '/status', icon: Activity, label: 'Status' },
] as const;

const MANAGE_ITEM = { href: '/manage', icon: Wrench, label: 'Manage' } as const;

const LOGS_ITEM = { href: '/logs', icon: Terminal, label: 'Logs' } as const;

const SETTINGS_ITEM = { href: '/settings', icon: Settings, label: 'Settings' } as const;

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

export const IconBar = memo(function IconBar({ merged = false }: { merged?: boolean }) {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const showManage = preferences?.managementDashboard === true;

  return (
    <nav
      className={cn(
        'flex h-full w-16 md:w-20 shrink-0 flex-col items-center bg-card py-6 shadow-xs border border-border/50',
        merged ? 'rounded-t-2xl lg:rounded-l-2xl lg:rounded-r-none lg:border-r-0' : 'rounded-2xl',
      )}
    >
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
        {showManage && (
          <NavIcon
            href={MANAGE_ITEM.href}
            icon={MANAGE_ITEM.icon}
            label={MANAGE_ITEM.label}
            isActive={pathname === MANAGE_ITEM.href || pathname.startsWith(`${MANAGE_ITEM.href}/`)}
          />
        )}
      </div>

      {/* Logs + Settings pinned to bottom */}
      <div className="mt-4 flex w-full flex-col items-center gap-4">
        <NavIcon
          href={LOGS_ITEM.href}
          icon={LOGS_ITEM.icon}
          label={LOGS_ITEM.label}
          isActive={pathname === LOGS_ITEM.href || pathname.startsWith(`${LOGS_ITEM.href}/`)}
        />
        <NavIcon
          href={SETTINGS_ITEM.href}
          icon={SETTINGS_ITEM.icon}
          label={SETTINGS_ITEM.label}
          isActive={
            pathname === SETTINGS_ITEM.href || pathname.startsWith(`${SETTINGS_ITEM.href}/`)
          }
        />
      </div>
    </nav>
  );
});
