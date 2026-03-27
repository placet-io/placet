'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type {
  PluginAttachmentInfo,
  PluginRendererContext,
  PluginReviewContext,
} from '@placet/shared';
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
  review?: PluginReviewContext | null;
  isPreview?: boolean;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
  onReviewRespond?: (response: Record<string, unknown>) => Promise<void>;
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
  review,
  isPreview,
  onAction,
  onReviewRespond,
  className,
}: PluginRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [renderHtml, setRenderHtml] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [env, setEnv] = useState<Record<string, string>>({});

  // Fetch the plugin's render.html from the backend
  useEffect(() => {
    let cancelled = false;

    async function fetchRenderHtml() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/plugins/${pluginName}/render`, {
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? `Plugin "${pluginName}" not found`
              : `Failed to load plugin (${res.status})`,
          );
        }

        const json = await res.json();

        if (!cancelled) {
          setRenderHtml(json.html);
          setEnv(json.env ?? {});
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
          // Proxy fetch through the backend to avoid CORS issues
          const { id, payload } = msg as {
            id: string;
            payload: {
              url: string;
              method?: string;
              headers?: Record<string, string>;
              body?: string;
            };
          };

          try {
            const proxyRes = await fetch(`/api/plugins/${pluginName}/fetch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                url: payload.url,
                method: payload.method || 'GET',
                headers: payload.headers || {},
                body: payload.body,
              }),
            });

            const result = await proxyRes.json();

            if (!proxyRes.ok) {
              iframe.contentWindow?.postMessage(
                {
                  type: 'hp:fetch:response',
                  id,
                  payload: {
                    ok: false,
                    error: result.message || `Proxy error (${proxyRes.status})`,
                  },
                },
                '*',
              );
            } else {
              iframe.contentWindow?.postMessage(
                { type: 'hp:fetch:response', id, payload: result },
                '*',
              );
            }
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

        case 'hp:respond': {
          const { id: respondId, payload: respondPayload } = msg as {
            id: string;
            payload: { response: Record<string, unknown> };
          };

          if (!onReviewRespond) {
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:respond:result',
                id: respondId,
                payload: { ok: false, error: 'Review responses not supported in this context' },
              },
              '*',
            );
            break;
          }

          try {
            await onReviewRespond(respondPayload.response);
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:respond:result',
                id: respondId,
                payload: { ok: true },
              },
              '*',
            );
          } catch (err) {
            iframe.contentWindow?.postMessage(
              {
                type: 'hp:respond:result',
                id: respondId,
                payload: {
                  ok: false,
                  error: err instanceof Error ? err.message : 'Respond failed',
                },
              },
              '*',
            );
          }
          break;
        }
      }
    },
    [onAction, onReviewRespond, attachments, pluginName],
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
    env,
    review: review ?? null,
    isPreview: !!isPreview,
  };

  const srcdoc = renderHtml !== null ? buildSrcdoc(renderHtml, context) : undefined;

  if (error) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3 text-xs text-muted-foreground ${className || ''}`}
      >
        <AlertTriangle size={14} className="shrink-0 text-amber-500" />
        <span>{error}</span>
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
        height: isPreview ? '100%' : `${height}px`,
        border: 'none',
        overflow: isPreview ? 'auto' : 'hidden',
        borderRadius: isPreview ? 0 : '0.5rem',
      }}
      className={className}
    />
  );
}
