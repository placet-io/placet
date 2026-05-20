const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Extract a human-readable error message from an arbitrary JSON error body.
 *
 * Supports several envelope shapes seen across our backends:
 *   - `{ error: { message: "..." } }`  — agent runtimes + the agent-management proxy
 *   - `{ message: "..." }`             — Placet's REST handlers
 *   - `{ detail: "..." }`              — FastAPI / generic
 *   - `{ error: "..." }`               — short form
 * Falls back to the HTTP statusText when nothing usable is found.
 */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const err = b.error;
    if (err && typeof err === 'object') {
      const m = (err as Record<string, unknown>).message;
      if (typeof m === 'string' && m.length > 0) return m;
    }
    if (typeof err === 'string' && err.length > 0) return err;
    if (typeof b.message === 'string' && b.message.length > 0) return b.message;
    if (typeof b.detail === 'string' && b.detail.length > 0) return b.detail;
  }
  return fallback || 'Request failed';
}

// ── Token refresh coordination ──────────────────────────────────
// Prevents multiple concurrent refresh requests when several API
// calls fail with 401 simultaneously.
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

function refreshToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = attemptRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ── Centralized API client ──────────────────────────────────────
// On 401: attempts a token refresh then retries the original request
// exactly once. If the retry also fails with 401, redirects to /login.

async function rawFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.body != null && !(opts.body instanceof FormData)) {
    headers['Content-Type'] ??= 'application/json';
  }
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    credentials: 'include',
    headers,
  });
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, opts);

  // On 401, try refreshing the token and retry once
  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      res = await rawFetch(path, opts);
    }
  }

  // Still 401 after refresh attempt → redirect to login
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, extractErrorMessage(body, res.statusText));
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiText(path: string, opts: RequestInit = {}): Promise<string> {
  let res = await rawFetch(path, opts);

  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      res = await rawFetch(path, opts);
    }
  }

  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, extractErrorMessage(body, res.statusText));
  }

  return res.text();
}
