'use client';

import { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isDesktopApp, setDesktopServerUrl } from '@/lib/native';

function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('URL must start with http:// or https://');
  }
  // Throws if invalid.
  new URL(trimmed);
  return trimmed;
}

async function probe(target: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // Any response (2xx/3xx/4xx) proves the host is reachable. The
    // endpoint exists on every Placet backend.
    await fetch(`${target}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function ServerSettingsButton() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  if (!mounted || !isDesktopApp()) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let normalizedBase: string;
    let normalizedApi: string | null = null;
    try {
      normalizedBase = normalize(baseUrl);
      if (apiUrl.trim() !== '') normalizedApi = normalize(apiUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid URL');
      return;
    }

    setSubmitting(true);
    try {
      try {
        await probe(normalizedApi ?? normalizedBase);
      } catch {
        setError(
          `Could not reach ${normalizedApi ?? normalizedBase}. Check the URL and try again.`,
        );
        return;
      }

      const ok = await setDesktopServerUrl(normalizedBase);
      if (!ok) {
        setError('Could not talk to the desktop shell. Please restart the app.');
        return;
      }
      setOpen(false);
      // The Rust side reloads the webview; closing the dialog hides it
      // cleanly until that happens.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Server settings"
        onClick={() => setOpen(true)}
        className="absolute left-4 top-12 gap-2 rounded-xl"
      >
        <Server className="h-4 w-4" />
        Server settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Server settings</DialogTitle>
            <DialogDescription>
              Change the Placet server this desktop app connects to.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="server-base-url">Placet Server URL</Label>
              <Input
                id="server-base-url"
                type="url"
                placeholder="https://placet.example.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
                autoFocus
                className="h-10 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                The public URL of your Placet instance. For the unified Docker image this is the
                same as the frontend URL.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? '▾' : '▸'} Advanced — separate API URL
            </button>

            {showAdvanced && (
              <div className="space-y-2">
                <Label htmlFor="server-api-url">API URL (optional)</Label>
                <Input
                  id="server-api-url"
                  type="url"
                  placeholder="https://api.placet.example.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Only set this if your backend is hosted on a different origin than the frontend.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting} className="rounded-xl">
                {submitting ? 'Connecting…' : 'Connect'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
