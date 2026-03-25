'use client';

import { memo } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const THEMES = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
] as const;

export const AppearanceSection = memo(function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Monitor className="text-muted-foreground" size={24} />
        <h2 className="text-xl font-semibold text-foreground">Appearance</h2>
      </div>

      <div className="space-y-4">
        <Label className="text-muted-foreground">Theme</Label>
        <div className="flex items-center gap-3">
          {THEMES.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={theme === key ? 'default' : 'outline'}
              onClick={() => setTheme(key)}
              className="gap-2 rounded-xl"
            >
              <Icon size={18} />
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
});
