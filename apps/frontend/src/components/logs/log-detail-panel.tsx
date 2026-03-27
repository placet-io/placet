'use client';

import { memo, useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiLog } from '@placet/shared';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'secret',
  'token',
  'authorization',
  'api_key',
  'apikey',
  'key_hash',
  'keyhash',
]);

function maskSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj;
  if (Array.isArray(obj)) return obj.map((v) => maskSensitive(v, depth + 1));
  if (typeof obj === 'object' && obj !== null) {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        masked[key] = '***';
      } else {
        masked[key] = maskSensitive(value, depth + 1);
      }
    }
    return masked;
  }
  return obj;
}

interface LogDetailPanelProps {
  log: ApiLog;
}

export const LogDetailPanel = memo(function LogDetailPanel({ log }: LogDetailPanelProps) {
  const maskedRequest = useMemo(
    () => (log.requestBody ? (maskSensitive(log.requestBody) as Record<string, unknown>) : null),
    [log.requestBody],
  );
  const maskedResponse = useMemo(
    () => (log.responseBody ? (maskSensitive(log.responseBody) as Record<string, unknown>) : null),
    [log.responseBody],
  );

  return (
    <div className="space-y-3 px-2 pb-2 text-sm">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {log.direction === 'inbound' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
          {log.direction === 'inbound' ? 'Inbound (Agent → API)' : 'Outbound (API → Webhook)'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={12} />
          {log.durationMs}ms
        </span>
        {log.apiKeyId && <span>API Key: {log.apiKeyId.slice(0, 8)}…</span>}
      </div>

      {/* Request */}
      {maskedRequest && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Request Body</p>
          <pre
            className={cn(
              'rounded-lg bg-muted/50 border border-border p-3 text-xs',
              'overflow-x-auto max-h-64 overflow-y-auto font-mono text-foreground',
            )}
          >
            {JSON.stringify(maskedRequest, null, 2)}
          </pre>
        </div>
      )}

      {/* Response */}
      {maskedResponse && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Response Body</p>
          <pre
            className={cn(
              'rounded-lg bg-muted/50 border border-border p-3 text-xs',
              'overflow-x-auto max-h-64 overflow-y-auto font-mono text-foreground',
            )}
          >
            {JSON.stringify(maskedResponse, null, 2)}
          </pre>
        </div>
      )}

      {!maskedRequest && !maskedResponse && (
        <p className="text-xs text-muted-foreground italic">
          No request or response body recorded.
        </p>
      )}
    </div>
  );
});
