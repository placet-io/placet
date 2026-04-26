import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';
import { BadRequestException } from '@nestjs/common';

/**
 * SSRF guard for user-supplied management URLs.
 *
 * The management bearer token is stamped on every outbound request, so a
 * compromised `managementUrl` directly targets whatever host the DNS resolves
 * to. We always enforce:
 *
 *  - only `http:` / `https:` schemes,
 *  - DNS resolution must succeed (no empty answers).
 *
 * The private-address reject list (loopback, RFC1918, CGNAT, ULA, link-local,
 * multicast, metadata IPs) is **opt-in** via `MANAGEMENT_SSRF_GUARD`. By
 * default it is OFF because Placet typically runs alongside agent runtimes on
 * the same Docker network or host, where the management URL legitimately
 * points at a private address (`http://agent:7331`, `http://localhost:7331`).
 *
 * Set `MANAGEMENT_SSRF_GUARD=strict` (also accepts `on`/`true`/`1`) to enable
 * the full reject list — recommended when management URLs are user-controlled
 * and the backend can reach untrusted internal endpoints.
 *
 * DNS rebinding is mitigated only partially: we re-resolve right before
 * `fetch`, so there's still a TOCTOU window. Full protection requires pinning
 * the socket to a specific IP; that's out of scope for this iteration.
 */

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/** Returns true when the strict private-address reject list is enabled. */
function isStrictGuardEnabled(): boolean {
  const v = (process.env.MANAGEMENT_SSRF_GUARD ?? '').trim().toLowerCase();
  return v === 'strict' || v === 'on' || v === 'true' || v === '1';
}

/** Synchronous URL + scheme check. Throws 400 on bad URL. */
export function assertSafeUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid management URL');
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new BadRequestException(
      `Only http(s) schemes are allowed for management URLs (got "${parsed.protocol}")`,
    );
  }
  return parsed;
}

/** Reject RFC1918 / loopback / link-local / ULA / metadata / multicast. */
export function isPrivateIp(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) return isPrivateIpv4(addr);
  if (v === 6) return isPrivateIpv6(addr);
  return true; // unknown shape → treat as unsafe
}

function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0/8
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP/Azure metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(addr: string): boolean {
  const norm = addr.toLowerCase();
  if (norm === '::' || norm === '::1') return true;
  if (norm.startsWith('fe80:')) return true; // link-local
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // ULA fc00::/7
  if (norm.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  if (norm.startsWith('::ffff:')) {
    const v4 = norm.slice(7);
    if (isIP(v4) === 4) return isPrivateIpv4(v4);
  }
  return false;
}

/**
 * Resolve `host` and reject the request if any answer is a private address.
 * Callers should invoke this immediately before `fetch`; they should also
 * revalidate after any redirect.
 *
 * When `MANAGEMENT_SSRF_GUARD` is unset/off, this still resolves DNS so
 * unreachable hosts fail fast, but does not block private addresses.
 */
export async function assertPublicHost(host: string): Promise<void> {
  const strict = isStrictGuardEnabled();

  // If the host already is a literal IP, check it directly (skip DNS).
  if (isIP(host)) {
    if (strict && isPrivateIp(host)) {
      throw new BadRequestException(
        `Management URL host "${host}" resolves to a private address`,
      );
    }
    return;
  }
  let records: { address: string }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new BadRequestException(
      `Management URL host "${host}" could not be resolved`,
    );
  }
  if (records.length === 0) {
    throw new BadRequestException(
      `Management URL host "${host}" has no A/AAAA records`,
    );
  }
  if (!strict) return;
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new BadRequestException(
        `Management URL host "${host}" resolves to a private address`,
      );
    }
  }
}
