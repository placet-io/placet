import { IconBar } from '@/components/layout/icon-bar';
import { SocketProvider } from '@/lib/contexts/socket-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SocketProvider>
      <div className="flex h-screen overflow-hidden bg-background font-sans justify-center">
        <div className="flex w-full max-w-[2000px] lg:p-4 lg:gap-4">
          <div className="hidden lg:flex">
            <IconBar />
          </div>
          <div className="flex flex-1 min-h-0 min-w-0 lg:gap-4">{children}</div>
        </div>
      </div>
    </SocketProvider>
  );
}
