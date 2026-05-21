'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Folder,
  Inbox,
  Menu,
  MessageSquare,
  Settings,
  Terminal,
  Activity,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/lib/hooks/use-preferences';
const NAV_ITEMS = [
  { href: '/chats', icon: MessageSquare, label: 'Agents' },
  { href: '/inbox', icon: Inbox, label: 'Inbox' },
  { href: '/files', icon: Folder, label: 'Files' },
  { href: '/status', icon: Activity, label: 'Status' },
] as const;

const MANAGE_ITEM = { href: '/manage', icon: Wrench, label: 'Manage' } as const;

const BOTTOM_NAV_ITEMS = [
  { href: '/logs', icon: Terminal, label: 'Logs' },
  { href: '/settings', icon: Settings, label: 'Settings' },
] as const;

export const MobileNavDrawer = memo(function MobileNavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { preferences } = usePreferences();
  const showManage = preferences?.managementDashboard === true;

  const handleClose = useCallback(() => setOpen(false), []);

  const drawerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Document-level Escape + focus trap while drawer is open.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      const root = drawerRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('aria-hidden'));
    };

    // Move focus into the drawer.
    const first = focusables()[0];
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, handleClose]);

  const navItems = useMemo(
    () => (showManage ? [...NAV_ITEMS, MANAGE_ITEM] : NAV_ITEMS),
    [showManage],
  );

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Menu size={20} />
      </Button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!open}
        className={cn(
          'fixed top-0 left-0 z-50 flex h-full w-72 flex-col bg-card shadow-xl transition-transform duration-200 lg:hidden rounded-r-3xl',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shadow-sm">
              <img src="/logo-white.svg" alt="Placet" className="h-5 w-5 dark:hidden" />
              <img src="/logo-black.svg" alt="Placet" className="h-5 w-5 hidden dark:block" />
            </div>
            <span className="text-sm font-semibold text-foreground">Placet</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X size={18} />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive =
              href === '/manage'
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
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

        <nav className="border-t border-border/50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-1">
          {BOTTOM_NAV_ITEMS.map(({ href, icon: Icon, label }) => {
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
