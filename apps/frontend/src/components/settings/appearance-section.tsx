'use client';

import { memo } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useChatSettings } from '@/lib/hooks/use-chat-settings';

const THEMES = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
] as const;

export const AppearanceSection = memo(function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { settings, update } = useChatSettings();

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

      <div className="space-y-3 pt-2 border-t border-border/50">
        <Label className="text-muted-foreground">Chat</Label>
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Inline HTML rendering</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Render HTML files directly inside the chat when they are the only attachment in a
              message. Custom CSS is preserved.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.inlineHtml}
            onClick={() => update({ inlineHtml: !settings.inlineHtml })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              settings.inlineHtml ? 'bg-primary' : 'bg-input'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                settings.inlineHtml ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
});
