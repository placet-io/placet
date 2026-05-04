'use client';

import { memo, useState } from 'react';
import { useTheme } from 'next-themes';
import { Bell, ExternalLink, Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useChatSettings } from '@/lib/hooks/use-chat-settings';
import { useSocket } from '@/lib/contexts/socket-context';
import { openDesktopNotificationSettings } from '@/lib/native';

const THEMES = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
] as const;

export const AppearanceSection = memo(function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { settings, update } = useChatSettings();
  const [notificationPending, setNotificationPending] = useState(false);
  const [notificationFeedback, setNotificationFeedback] = useState<string | null>(null);
  const {
    notificationsEnabled,
    notificationsSupported,
    notificationsNative,
    iosRequiresInstall,
    requestNotifications,
  } = useSocket();

  const notificationsDenied =
    !notificationsNative &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'denied';
  const notificationTitle = notificationsNative ? 'System notifications' : 'Browser notifications';
  const notificationDescription = notificationsNative
    ? 'Use macOS or Windows system notifications when an agent sends a new message.'
    : iosRequiresInstall
      ? 'On iOS, notifications only work when Placet is installed to the home screen. Open Safari → Share → "Add to Home Screen", then open Placet from the home screen and enable notifications here.'
      : !notificationsSupported
        ? 'This browser does not support push notifications.'
        : notificationsDenied
          ? 'Notifications have been blocked. Please enable them in your browser settings.'
          : 'Get notified when an agent sends a new message while the tab is in the background.';

  async function handleNotificationToggle() {
    setNotificationPending(true);
    setNotificationFeedback(null);
    const ok = await requestNotifications();
    setNotificationPending(false);
    if (!ok && !notificationsEnabled) {
      setNotificationFeedback(
        notificationsNative
          ? 'Notifications could not be enabled. Open Placet from Applications and check macOS notification permissions.'
          : 'Notifications could not be enabled.',
      );
    }
  }

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

      <div className="space-y-3 pt-2 border-t border-border/50">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-muted-foreground" />
          <Label className="text-muted-foreground">Notifications</Label>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">{notificationTitle}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{notificationDescription}</p>
            {notificationFeedback && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-destructive">{notificationFeedback}</p>
                {notificationsNative && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="rounded-lg"
                    onClick={() => void openDesktopNotificationSettings()}
                  >
                    <ExternalLink size={12} className="mr-1" />
                    Open macOS Settings
                  </Button>
                )}
              </div>
            )}
          </div>
          {iosRequiresInstall || !notificationsSupported ? (
            <span className="text-xs text-muted-foreground italic shrink-0">Unavailable</span>
          ) : notificationsDenied ? (
            <span className="text-xs text-muted-foreground italic shrink-0">Blocked</span>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              aria-busy={notificationPending}
              onClick={() => void handleNotificationToggle()}
              disabled={notificationPending}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                notificationsEnabled ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
