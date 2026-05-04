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

const DESKTOP_USER_AGENT_RE = /\b(?:PlacetDesktop|Tauri)\b/i;
const NOTIFICATION_PERMISSION_EVENT = 'placet:native-notification-permission';

function getTauri(): TauriInternals | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    __TAURI_INTERNALS__?: TauriInternals;
    __TAURI__?: { core?: TauriInternals; invoke?: TauriInternals['invoke'] };
  };
  if (win.__TAURI_INTERNALS__) return win.__TAURI_INTERNALS__;
  if (win.__TAURI__?.core) return win.__TAURI__.core;
  if (win.__TAURI__?.invoke) return { invoke: win.__TAURI__.invoke };
  return null;
}

function hasDesktopMarker(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.dataset.placetDesktop === 'true' ||
    DESKTOP_USER_AGENT_RE.test(navigator.userAgent)
  );
}

export function isDesktopApp(): boolean {
  return getTauri() !== null || hasDesktopMarker();
}

export function markDesktopDocument(): void {
  if (isDesktopApp()) {
    document.documentElement.dataset.placetDesktop = 'true';
  }
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
  const tauri = getTauri();
  if (tauri) {
    try {
      const granted = await tauri.invoke('is_system_notification_permission_granted');
      return granted === true;
    } catch {
      /* fall back to plugin check */
    }
    try {
      const granted = await tauri.invoke('plugin:notification|is_permission_granted');
      return granted === true;
    } catch {
      return false;
    }
  }

  if (hasDesktopMarker()) return true;

  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
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
      // Native notification failed; avoid showing browser notifications in the desktop shell.
    }
  }

  if (hasDesktopMarker() && typeof window !== 'undefined') {
    const params = new URLSearchParams({ title });
    if (body) params.set('body', body);
    window.location.href = `placet://notify?${params.toString()}`;
    return;
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch {
      /* ignore — some browsers reject silently */
    }
  }
}

interface NativeNotificationPermissionDetail {
  nonce?: string;
  granted?: boolean;
}

function requestNotificationPermissionViaNavigation(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener(NOTIFICATION_PERMISSION_EVENT, handlePermissionResult);
      resolve(false);
    }, 5000);

    function handlePermissionResult(event: Event) {
      const detail = (event as CustomEvent<NativeNotificationPermissionDetail>).detail;
      if (detail?.nonce !== nonce) return;
      window.clearTimeout(timeout);
      window.removeEventListener(NOTIFICATION_PERMISSION_EVENT, handlePermissionResult);
      resolve(detail.granted === true);
    }

    window.addEventListener(NOTIFICATION_PERMISSION_EVENT, handlePermissionResult);
    window.location.href = `placet://request-notification-permission?nonce=${encodeURIComponent(nonce)}`;
  });
}

/** Request notification permission via the platform-appropriate API. */
export async function requestNotificationPermission(): Promise<boolean> {
  const tauri = getTauri();
  if (tauri) {
    try {
      const granted = await tauri.invoke('request_system_notification_permission');
      return granted === true;
    } catch {
      /* fall back to plugin request */
    }
    try {
      const granted = await tauri.invoke('plugin:notification|is_permission_granted');
      if (granted === true) return true;
      const result = await tauri.invoke('plugin:notification|request_permission');
      // macOS may return 'default' if the user dismisses the prompt or the
      // app is unsigned. Re-check the granted state directly to get the
      // authoritative answer.
      if (result === 'granted') return true;
      const after = await tauri.invoke('plugin:notification|is_permission_granted');
      return after === true;
    } catch (err) {
      console.error('[placet] notification permission request failed', err);
      return false;
    }
  }

  if (hasDesktopMarker()) return requestNotificationPermissionViaNavigation();

  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

interface TauriEventApi {
  emit: (event: string, payload?: unknown) => Promise<void>;
}

function getTauriEvent(): TauriEventApi | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as { __TAURI__?: { event?: TauriEventApi } };
  return win.__TAURI__?.event ?? null;
}

/**
 * Persist a new Placet server URL via the desktop shell and reload the
 * webview to point at it. Returns true on success, false if the IPC
 * call failed or we're not running in Tauri.
 */
export async function setDesktopServerUrl(url: string): Promise<boolean> {
  const tauri = getTauri();
  if (tauri) {
    try {
      await tauri.invoke('set_server_url', { url });
      return true;
    } catch {
      // Fall through to event-bus fallback
    }
  }
  const event = getTauriEvent();
  if (event) {
    try {
      await event.emit('placet://set-server-url', url);
      return true;
    } catch {
      /* ignore */
    }
  }
  if (hasDesktopMarker() && typeof window !== 'undefined') {
    window.location.href = `placet://set-server-url?url=${encodeURIComponent(url)}`;
    return true;
  }
  return false;
}

/**
 * Clear the saved Placet server URL and return to the connect screen.
 * Returns true on success, false if the IPC call failed or we're not
 * running in Tauri.
 */
export async function disconnectDesktop(): Promise<boolean> {
  const tauri = getTauri();
  if (tauri) {
    try {
      await tauri.invoke('disconnect');
      return true;
    } catch {
      /* ignore */
    }
  }
  const event = getTauriEvent();
  if (event) {
    try {
      await event.emit('placet://disconnect');
      return true;
    } catch {
      /* ignore */
    }
  }
  if (hasDesktopMarker() && typeof window !== 'undefined') {
    window.location.href = 'placet://disconnect';
    return true;
  }
  return false;
}

export async function openDesktopNotificationSettings(): Promise<boolean> {
  const tauri = getTauri();
  if (tauri) {
    try {
      await tauri.invoke('open_system_notification_settings');
      return true;
    } catch {
      /* ignore */
    }
  }

  const event = getTauriEvent();
  if (event) {
    try {
      await event.emit('placet://open-notification-settings');
      return true;
    } catch {
      /* ignore */
    }
  }

  if (hasDesktopMarker() && typeof window !== 'undefined') {
    window.location.href = 'placet://open-notification-settings';
    return true;
  }

  return false;
}
