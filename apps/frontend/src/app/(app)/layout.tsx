'use client';

import { usePathname } from 'next/navigation';
import { IconBar } from '@/components/layout/icon-bar';
import { PhonePortraitGuard } from '@/components/layout/phone-portrait-guard';
import { SocketProvider } from '@/lib/contexts/socket-context';
import { cn } from '@/lib/utils';

const MERGED_ROUTES = /^\/(chats|inbox)(\/|$)/;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const merged = MERGED_ROUTES.test(pathname);

  return (
    <SocketProvider>
      <PhonePortraitGuard>
        <div className="flex h-full overflow-hidden bg-background font-sans">
          <div
            className={cn(
              'flex w-full pt-[env(safe-area-inset-top)] lg:p-4',
              merged ? 'lg:gap-0' : 'lg:gap-4',
            )}
          >
            <div className="hidden lg:flex">
              <IconBar merged={merged} />
            </div>
            <div className="flex flex-1 min-h-0 min-w-0 lg:gap-4 pb-[env(safe-area-inset-bottom)] lg:pb-0">
              {children}
            </div>
          </div>
        </div>
      </PhonePortraitGuard>
    </SocketProvider>
  );
}
