'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppViewport } from '@/lib/hooks/use-app-viewport';

function getShouldBlockLandscape() {
  if (typeof window === 'undefined') return false;

  const isPhone = window.matchMedia('(max-width: 767px)').matches;
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;
  return isPhone && isLandscape;
}

export function PhonePortraitGuard({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useAppViewport();

  useEffect(() => {
    const update = () => {
      setBlocked(getShouldBlockLandscape());
    };

    update();

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (blocked) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-background px-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-3xl border border-border/60 bg-card px-6 py-8 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-primary">
            <RotateCcw size={24} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Rotate back to portrait</h2>
            <p className="text-sm text-muted-foreground">
              Placet is currently optimized for phone portrait mode.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
