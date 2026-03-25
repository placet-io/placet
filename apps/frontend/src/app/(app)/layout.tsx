import { IconBar } from '@/components/layout/icon-bar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background lg:p-4 lg:gap-4 font-sans">
      <div className="hidden lg:flex">
        <IconBar />
      </div>
      <div className="flex flex-1 overflow-hidden lg:gap-4">{children}</div>
    </div>
  );
}
