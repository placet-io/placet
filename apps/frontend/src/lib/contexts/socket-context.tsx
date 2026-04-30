'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { isDesktopApp, notify, requestNotificationPermission } from '@/lib/native';
import type { Message } from '@placet/shared';

// ── Types ────────────────────────────────────────────────────────────────────

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  activeChannel: string | null;
  notificationsEnabled: boolean;
  /** True when the browser exposes the Notification + Push APIs at all. */
  notificationsSupported: boolean;
  /**
   * True when running on iOS Safari in a regular browser tab (not the
   * installed PWA). iOS only exposes Web Push for home-screen PWAs, so the
   * settings UI shows a hint asking the user to "Add to Home Screen" first.
   */
  iosRequiresInstall: boolean;
  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
  markRead: (channelId: string) => void;
  requestNotifications: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function getWsUrl(): string {
  if (typeof window !== 'undefined') {
    const cfg = (window as unknown as { __HP_CONFIG__?: { wsUrl: string } }).__HP_CONFIG__;
    if (cfg?.wsUrl) return cfg.wsUrl;
  }
  return process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchTicket(): Promise<string> {
  const { ticket } = await api<{ ticket: string }>('/api/auth/ws-ticket', {
    method: 'POST',
  });
  return ticket;
}

/** Register the Service Worker and subscribe to Web Push. */
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.ready;

    // Fetch the VAPID public key from the backend
    const { publicKey } = await api<{ publicKey: string | null }>('/api/push/vapid-key');
    if (!publicKey) return; // VAPID not configured on backend

    // Check for existing subscription first
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    // Send subscription to backend
    await api('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
          auth: arrayBufferToBase64(subscription.getKey('auth')!),
        },
      }),
    });
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function SocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  // Detect capability on the client after mount (avoid SSR `window` access).
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [iosRequiresInstall, setIosRequiresInstall] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasNotification = 'Notification' in window;
    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    setNotificationsSupported(hasNotification && hasSW && hasPush);

    // iOS Safari exposes Web Push only for installed PWAs. Detect iOS and
    // whether we're running in standalone (home-screen) mode.
    const ua = navigator.userAgent || '';
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' &&
        (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIosRequiresInstall(isIos && !standalone);
  }, []);
  const mountedRef = useRef(true);
  const activeChannelRef = useRef<string | null>(null);
  const sockRef = useRef<Socket | null>(null);
  const connectingRef = useRef(false);

  // ── Core connect function (stable ref, never recreated) ───────────────────
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  connectRef.current = async () => {
    // Prevent overlapping connect attempts
    if (connectingRef.current) return;
    connectingRef.current = true;

    try {
      // Tear down any prior socket completely
      if (sockRef.current) {
        sockRef.current.removeAllListeners();
        sockRef.current.disconnect();
        sockRef.current = null;
        if (mountedRef.current) {
          setSocket(null);
          setConnected(false);
        }
      }

      let ticket: string;
      try {
        ticket = await fetchTicket();
      } catch {
        return; // Auth failed — user not logged in
      }
      if (!mountedRef.current) return;

      const sock = io(`${getWsUrl()}/ws`, {
        auth: { token: ticket },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
        reconnectionAttempts: Infinity,
      });

      sockRef.current = sock;

      sock.on('connect', () => {
        if (mountedRef.current) setConnected(true);
        // Re-subscribe to the active channel after reconnect
        if (activeChannelRef.current) {
          sock.emit('subscribe:channel', activeChannelRef.current);
        }
      });

      sock.on('disconnect', (reason) => {
        if (mountedRef.current) setConnected(false);
        // If the server forced the disconnect, Socket.IO won't auto-reconnect
        // for "io server disconnect" / "io client disconnect". Force a full
        // reconnect with a fresh ticket.
        if (reason === 'io server disconnect') {
          setTimeout(() => {
            connectingRef.current = false;
            void connectRef.current?.();
          }, 1000);
        }
      });

      // If Socket.IO's built-in reconnect fails (e.g. expired ticket),
      // fetch a fresh ticket and do a full reconnect.
      sock.on('connect_error', () => {
        // Only act if this is a reconnection attempt (not the initial connect).
        // On initial connect the constructor already handles the error.
        if (sock.active) {
          // Socket.IO is still trying to reconnect — refresh the ticket
          // so the next attempt uses a valid one.
          fetchTicket()
            .then((newTicket) => {
              sock.auth = { token: newTicket };
            })
            .catch(() => {
              // Auth is completely gone — tear down and full reconnect on
              // next visibility/focus/online event.
              sock.disconnect();
            });
        }
      });

      // Fetch a fresh ticket before each reconnect attempt
      sock.on('reconnect_attempt', () => {
        fetchTicket()
          .then((newTicket) => {
            sock.auth = { token: newTicket };
          })
          .catch(() => {});
      });

      if (mountedRef.current) setSocket(sock);
    } finally {
      connectingRef.current = false;
    }
  };

  // Stable wrapper that always calls the latest connectRef
  const reconnect = useCallback(() => {
    void connectRef.current?.();
  }, []);

  // ── Ensure connection is alive. Called on visibility change + user actions ─
  const ensureConnected = useCallback(() => {
    const sock = sockRef.current;
    if (!sock || sock.disconnected) {
      // Socket doesn't exist or was explicitly disconnected — full reconnect
      reconnect();
      return;
    }
    if (!sock.connected) {
      // Socket exists but isn't connected. If Socket.IO's manager is no
      // longer trying (e.g. the transport was closed and it gave up), kick
      // it back into action. `sock.connect()` is a no-op if already trying.
      fetchTicket()
        .then((newTicket) => {
          sock.auth = { token: newTicket };
          sock.connect();
        })
        .catch(() => {
          // Ticket fetch failed — do a full reconnect
          reconnect();
        });
      return;
    }
    // Socket thinks it's connected — verify with a volatile ping.
    // If the pong doesn't come back within 3 s, force reconnect.
    const timeout = setTimeout(() => {
      // Pong never arrived — connection is stale
      reconnect();
    }, 3000);
    sock.volatile.emit('ping');
    sock.once('pong', () => clearTimeout(timeout));
  }, [reconnect]);

  // ── Initial connect + visibility / focus listeners ────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    reconnect();

    // When the tab becomes visible again (after sleep / tab switch / lock screen)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        ensureConnected();
      }
    }

    // When the window regains focus (catches cases visibilitychange misses)
    function handleFocus() {
      ensureConnected();
    }

    // When the browser comes back online after losing network
    function handleOnline() {
      reconnect();
    }

    // Periodic heartbeat: while the tab is visible, check every 30 s that the
    // connection is still alive. Browsers throttle timers for background tabs,
    // so this effectively only fires when the tab is in the foreground.
    const heartbeatId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        ensureConnected();
      }
    }, 30_000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if (sockRef.current) {
        sockRef.current.removeAllListeners();
        sockRef.current.disconnect();
        sockRef.current = null;
      }
      setSocket(null);
    };
  }, [reconnect, ensureConnected]);

  // ── Channel subscriptions ────────────────────────────────────────────────

  const subscribe = useCallback((channelId: string) => {
    activeChannelRef.current = channelId;
    setActiveChannel(channelId);
    sockRef.current?.emit('subscribe:channel', channelId);
  }, []);

  const unsubscribe = useCallback((channelId: string) => {
    if (activeChannelRef.current === channelId) {
      activeChannelRef.current = null;
      setActiveChannel(null);
    }
    sockRef.current?.emit('unsubscribe:channel', channelId);
  }, []);

  const markRead = useCallback((channelId: string) => {
    activeChannelRef.current = channelId;
    setActiveChannel(channelId);
    void api(`/api/agents/${channelId}/read`, { method: 'POST' }).catch(() => {});
    sockRef.current?.emit('channel:read', channelId);
  }, []);

  // ── Browser notifications + Push API ──────────────────────────────────────

  const requestNotifications = useCallback(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      void subscribeToPush();
      return;
    }
    if (Notification.permission === 'denied') return;
    // Must call requestPermission() synchronously inside the gesture handler
    // on iOS — awaiting another promise first loses the "user-activation"
    // flag and the prompt silently fails. The promise we return here is
    // unchained; its `.then` runs after the browser has shown the dialog.
    const result = Notification.requestPermission();
    // Older Safari versions only accept the callback form. Support both.
    if (result && typeof result.then === 'function') {
      result.then((perm) => {
        setNotificationsEnabled(perm === 'granted');
        if (perm === 'granted') void subscribeToPush();
      });
    }
  }, []);

  // Register Service Worker on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }, []);

  // Auto-request notification permission on first user interaction.
  // Browsers block Notification.requestPermission() unless it's inside
  // a user-gesture handler (click / keydown), so we attach a one-shot
  // listener and prompt on the very first interaction.
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') {
      // Already granted — ensure push subscription is active
      if (Notification.permission === 'granted') void subscribeToPush();
      return;
    }

    function handleUserGesture() {
      document.removeEventListener('click', handleUserGesture, true);
      document.removeEventListener('keydown', handleUserGesture, true);
      Notification.requestPermission().then((perm) => {
        if (mountedRef.current) setNotificationsEnabled(perm === 'granted');
        if (perm === 'granted') void subscribeToPush();
      });
    }

    document.addEventListener('click', handleUserGesture, true);
    document.addEventListener('keydown', handleUserGesture, true);
    return () => {
      document.removeEventListener('click', handleUserGesture, true);
      document.removeEventListener('keydown', handleUserGesture, true);
    };
  }, []);

  // ── Desktop (Tauri): native notifications for new messages ───────────────
  // The desktop webview can't run the service-worker / Web Push pipeline
  // we rely on in browsers. Instead, listen on the socket directly and
  // route to the OS notification center via the Tauri plugin.
  useEffect(() => {
    if (!socket || !isDesktopApp()) return;
    void requestNotificationPermission();

    const handleMessageCreated = (msg: Message) => {
      if (msg.senderType !== 'agent') return;
      if (msg.channelId === activeChannelRef.current) return;
      const body = msg.text?.trim().slice(0, 200) || 'New message';
      void notify('Placet', body);
    };

    socket.on('message:created', handleMessageCreated);
    return () => {
      socket.off('message:created', handleMessageCreated);
    };
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        activeChannel,
        notificationsEnabled,
        notificationsSupported,
        iosRequiresInstall,
        subscribe,
        unsubscribe,
        markRead,
        requestNotifications,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
