// Native (Tauri) integration helpers.
//
// The desktop shell loads the Placet web frontend in a Tauri webview
// and grants IPC permissions to the remote origin (see
// `apps/desktop/src-tauri/capabilities/remote.json`). When running in
// that shell, `window.__TAURI_INTERNALS__` is injected and we can route
// notifications through the OS-native notification center via the
// `tauri-plugin-notification` IPC handler.
//
// In a regular browser the helpers fall back to the Web Notification
// API. In neither case do we throw — failure is silent so that callers
// can use `notify()` unconditionally.

interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function getTauri(): TauriInternals | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { __TAURI_INTERNALS__?: TauriInternals };
  return w.__TAURI_INTERNALS__ ?? null;
}

export function isDesktopApp(): boolean {
  return getTauri() !== null;
}

/**
 * Show a system notification. Uses the Tauri plugin when running in
 * the desktop shell, falls back to the Web Notification API otherwise.
 * Never throws.
 */
export async function notify(title: string, body?: string): Promise<void> {
  const tauri = getTauri();
  if (tauri) {
    try {
      await tauri.invoke('plugin:notification|notify', {
        options: { title, body },
      });
      return;
    } catch {
      // Fall through to Web Notification API on plugin errors.
    }
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      // eslint-disable-next-line no-new
      new Notification(title, { body });
    } catch {
      /* ignore — some browsers reject silently */
    }
  }
}

/** Request notification permission via the platform-appropriate API. */
export async function requestNotificationPermission(): Promise<boolean> {
  const tauri = getTauri();
  if (tauri) {
    try {
      const granted = await tauri.invoke('plugin:notification|is_permission_granted');
      if (granted) return true;
      const result = await tauri.invoke('plugin:notification|request_permission');
      return result === 'granted';
    } catch {
      return false;
    }
  }

  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}
