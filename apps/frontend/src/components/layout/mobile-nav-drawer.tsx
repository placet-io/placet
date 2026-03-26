'use client';

import { memo, useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bot, Folder, Menu, MessageSquare, Settings, Terminal, Activity, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
const NAV_ITEMS = [
  { href: '/chats', icon: MessageSquare, label: 'Agents' },
  { href: '/files', icon: Folder, label: 'Files' },
  { href: '/logs', icon: Terminal, label: 'Logs' },
  { href: '/status', icon: Activity, label: 'Status' },
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const;

export const MobileNavDrawer = memo(function MobileNavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </Button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={handleClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleClose();
          }}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-72 bg-card shadow-xl transition-transform duration-200 lg:hidden rounded-r-3xl',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Bot size={20} />
            </div>
            <span className="text-sm font-semibold text-foreground">HumanProxy</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X size={18} />
          </Button>
        </div>

        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={handleClose}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
});
