'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginAttachmentInfo, PluginRendererContext } from '@humanproxy/shared';
import { buildSrcdoc } from './bridge';

interface PluginRendererProps {
  pluginName: string;
  data: Record<string, unknown>;
  attachments?: PluginAttachmentInfo[];
  message: {
    id: string;
    channelId: string;
    senderType: string;
    createdAt: string;
  };
  theme?: 'light' | 'dark';
  onAction?: (action: string, data?: Record<string, unknown>) => void;
  className?: string;
}

const DEFAULT_HEIGHT = 100;
const MAX_HEIGHT = 800;

export function PluginRenderer({
  pluginName,
  data,
  attachments = [],
  message,
  theme = 'light',
  onAction,
  className,
}: PluginRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [renderHtml, setRenderHtml] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[] | null>(null);
  const [httpAllowed, setHttpAllowed] = useState(false);

  // Fetch the plugin's render.html from the backend
  useEffect(() => {
    let cancelled = false;

    async function fetchRenderHtml() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/plugins/${pluginName}/render`);
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? `Plugin "${pluginName}" not found`
              : `Failed to load plugin (${res.status})`,
          );
        }

        const json = await res.json();

        // Fetch plugin manifest to get permissions
        let domains: string[] | null = null;
        let canHttp = false;
        try {
          const manifestRes = await fetch(`/api/plugins/${pluginName}`, { credentials: 'include' });
          if (manifestRes.ok) {
            const manifest = await manifestRes.json();
            canHttp = manifest.permissions?.httpRequests === true;
            domains = manifest.permissions?.maxHttpDomains ?? null;
          }
        } catch {
          // If manifest fetch fails, default to no HTTP
        }

        if (!cancelled) {
          setRenderHtml(json.html);
          setAllowedDomains(domains);
          setHttpAllowed(canHttp);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load plugin');
          setLoading(false);
        }
      }
    }

    fetchRenderHtml();
    return () => {
      cancelled = true;
    };
  }, [pluginName]);

  // Handle postMessage from the iframe
  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'hp:resize': {
          const h = Math.min(Math.max(msg.payload?.height || DEFAULT_HEIGHT, 40), MAX_HEIGHT);
          setHeight(h);
          break;
        }

        case 'hp:toast': {
          // TODO: integrate with app toast system
          console.log('[Plugin toast]', msg.payload);
          break;
        }

        case 'hp:emit': {
          const { action, data: actionData } = msg.payload || {};
          if (action && onAction) {
            onAction(action, actionData);
          }
          break;
        }

        case 'hp:fetch': {
          // Proxy fetch on behalf of the sandboxed iframe
          const { id, payload } = msg as {
            id: string;
            payload: {
              url: string;
              method?: string;
              headers?: Record<string, string>;
              body?: string;
            };
          };

          // Enforce maxHttpDomains
          if (!httpAllowed) {
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:fetch:response',
                id,
                payload: { ok: false, error: 'HTTP requests not permitted for this plugin' },
              },
              '*',
            );
            break;
          }

          if (allowedDomains && !allowedDomains.includes('*')) {
            try {
              const reqUrl = new URL(payload.url);
              if (!allowedDomains.includes(reqUrl.hostname)) {
                iframe.contentWindow?.postMessage(
                  {
                    type: 'hp:fetch:response',
                    id,
                    payload: {
                      ok: false,
                      error: `Domain "${reqUrl.hostname}" not in plugin allowlist`,
                    },
                  },
                  '*',
                );
                break;
              }
            } catch {
              iframe.contentWindow?.postMessage(
                { type: 'hp:fetch:response', id, payload: { ok: false, error: 'Invalid URL' } },
                '*',
              );
              break;
            }
          }

          try {
            const res = await fetch(payload.url, {
              method: payload.method || 'GET',
              headers: payload.headers || {},
              body: payload.body,
            });

            const body = await res.text();
            const responseHeaders: Record<string, string> = {};
            res.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });

            iframe.contentWindow?.postMessage(
              {
                type: 'hp:fetch:response',
                id,
                payload: {
                  ok: res.ok,
                  status: res.status,
                  statusText: res.statusText,
                  headers: responseHeaders,
                  body,
                },
              },
              '*',
            );
          } catch (err) {
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:fetch:response',
                id,
                payload: {
                  ok: false,
                  error: err instanceof Error ? err.message : 'Fetch failed',
                },
              },
              '*',
            );
          }
          break;
        }

        case 'hp:getFile': {
          // Download file content via internal endpoint and return as base64
          const { id: fileId, payload: filePayload } = msg as {
            id: string;
            payload: { attachmentId: string };
          };
          try {
            const res = await fetch(`/api/files/${filePayload.attachmentId}/download`, {
              credentials: 'include',
            });
            if (!res.ok) throw new Error(`Download failed (${res.status})`);

            const blob = await res.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });

            const att = attachments.find((a) => a.id === filePayload.attachmentId);
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:getFile:response',
                id: fileId,
                payload: {
                  ok: true,
                  data: base64,
                  mimeType:
                    att?.mimeType || res.headers.get('content-type') || 'application/octet-stream',
                  filename: att?.filename || 'file',
                },
              },
              '*',
            );
          } catch (err) {
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:getFile:response',
                id: fileId,
                payload: {
                  ok: false,
                  error: err instanceof Error ? err.message : 'getFile failed',
                },
              },
              '*',
            );
          }
          break;
        }

        case 'hp:getFileUrl': {
          // Return a direct download URL for the attachment
          const { id: urlId, payload: urlPayload } = msg as {
            id: string;
            payload: { attachmentId: string };
          };
          try {
            const url = `/api/files/${urlPayload.attachmentId}/download`;
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:getFileUrl:response',
                id: urlId,
                payload: { ok: true, url },
              },
              '*',
            );
          } catch (err) {
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:getFileUrl:response',
                id: urlId,
                payload: {
                  ok: false,
                  error: err instanceof Error ? err.message : 'getFileUrl failed',
                },
              },
              '*',
            );
          }
          break;
        }
      }
    },
    [onAction, attachments, httpAllowed, allowedDomains],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Build the context and srcdoc
  const context: PluginRendererContext = {
    pluginName,
    data,
    attachments,
    message,
    theme,
  };

  const srcdoc = renderHtml !== null ? buildSrcdoc(renderHtml, context) : undefined;

  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3 text-sm text-red-600 dark:text-red-400 ${className || ''}`}
      >
        Plugin error: {error}
      </div>
    );
  }

  if (loading || !srcdoc) {
    return (
      <div
        className={`rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 text-sm text-zinc-400 animate-pulse ${className || ''}`}
      >
        Loading plugin…
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      title={`Plugin: ${pluginName}`}
      style={{
        width: '100%',
        height: `${height}px`,
        border: 'none',
        overflow: 'hidden',
        borderRadius: '0.5rem',
      }}
      className={className}
    />
  );
}
