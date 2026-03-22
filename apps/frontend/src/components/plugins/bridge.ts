/**
 * HumanProxy Plugin Bridge — injected into sandboxed iframes.
 *
 * This script is prepended to every plugin's render.html. It provides
 * the `HumanProxy` global object that plugins use to communicate with
 * the parent application via postMessage.
 */

import type {
  BridgeFetchRequest,
  BridgeFetchResponse,
  BridgeResizeMessage,
  BridgeToastMessage,
  BridgeEmitMessage,
  BridgeEventMessage,
  PluginRendererContext,
} from '@humanproxy/shared';

// ── Bridge script injected into iframe srcdoc ───────────────────────────────

export function buildBridgeScript(context: PluginRendererContext): string {
  return `
<script>
(function() {
  // Plugin data injected by the platform
  window.__PLUGIN_DATA__ = ${JSON.stringify(context.data)};
  window.__PLUGIN_ATTACHMENTS__ = ${JSON.stringify(context.attachments)};
  window.__PLUGIN_MESSAGE__ = ${JSON.stringify(context.message)};
  window.__PLUGIN_THEME__ = ${JSON.stringify(context.theme)};

  var _callbackId = 0;
  var _pendingCallbacks = {};
  var _eventHandlers = {};

  var HumanProxy = {
    data: window.__PLUGIN_DATA__,
    attachments: window.__PLUGIN_ATTACHMENTS__,
    message: window.__PLUGIN_MESSAGE__,
    theme: window.__PLUGIN_THEME__,

    fetch: function(url, options) {
      return new Promise(function(resolve, reject) {
        var id = 'hp_' + (++_callbackId);
        _pendingCallbacks[id] = { resolve: resolve, reject: reject };

        var timeout = setTimeout(function() {
          delete _pendingCallbacks[id];
          reject(new Error('Fetch timeout (30s)'));
        }, 30000);

        _pendingCallbacks[id].timeout = timeout;

        window.parent.postMessage({
          type: 'hp:fetch',
          id: id,
          payload: {
            url: url,
            method: (options && options.method) || 'GET',
            headers: (options && options.headers) || {},
            body: (options && options.body) || undefined
          }
        }, '*');
      });
    },

    resize: function() {
      var height = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.parent.postMessage({
        type: 'hp:resize',
        payload: { height: Math.min(height, 800) }
      }, '*');
    },

    toast: function(message, variant) {
      window.parent.postMessage({
        type: 'hp:toast',
        payload: { message: message, variant: variant || 'info' }
      }, '*');
    },

    emit: function(action, data) {
      window.parent.postMessage({
        type: 'hp:emit',
        payload: { action: action, data: data || {} }
      }, '*');
    },

    getFile: function(attachmentId) {
      return new Promise(function(resolve, reject) {
        var id = 'hp_' + (++_callbackId);
        _pendingCallbacks[id] = { resolve: resolve, reject: reject };

        var timeout = setTimeout(function() {
          delete _pendingCallbacks[id];
          reject(new Error('getFile timeout (30s)'));
        }, 30000);

        _pendingCallbacks[id].timeout = timeout;

        window.parent.postMessage({
          type: 'hp:getFile',
          id: id,
          payload: { attachmentId: attachmentId }
        }, '*');
      });
    },

    getFileUrl: function(attachmentId) {
      return new Promise(function(resolve, reject) {
        var id = 'hp_' + (++_callbackId);
        _pendingCallbacks[id] = { resolve: resolve, reject: reject };

        var timeout = setTimeout(function() {
          delete _pendingCallbacks[id];
          reject(new Error('getFileUrl timeout (30s)'));
        }, 30000);

        _pendingCallbacks[id].timeout = timeout;

        window.parent.postMessage({
          type: 'hp:getFileUrl',
          id: id,
          payload: { attachmentId: attachmentId }
        }, '*');
      });
    },

    on: function(event, handler) {
      if (!_eventHandlers[event]) _eventHandlers[event] = [];
      _eventHandlers[event].push(handler);
    }
  };

  // Listen for responses from parent
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || !msg.type) return;

    if ((msg.type === 'hp:fetch:response' || msg.type === 'hp:getFile:response' || msg.type === 'hp:getFileUrl:response') && msg.id && _pendingCallbacks[msg.id]) {
      var cb = _pendingCallbacks[msg.id];
      clearTimeout(cb.timeout);
      delete _pendingCallbacks[msg.id];
      if (msg.payload && msg.payload.error) {
        cb.reject(new Error(msg.payload.error));
      } else {
        cb.resolve(msg.payload);
      }
    }

    if (msg.type === 'hp:event' && msg.payload) {
      var handlers = _eventHandlers[msg.payload.event] || [];
      handlers.forEach(function(h) { h(msg.payload.data); });
    }
  });

  window.HumanProxy = HumanProxy;
})();
</script>`;
}

// ── Build full srcdoc for iframe ────────────────────────────────────────────

const TAILWIND_CDN = 'https://cdn.tailwindcss.com';

export function buildSrcdoc(
  renderHtml: string,
  context: PluginRendererContext,
): string {
  const bridgeScript = buildBridgeScript(context);
  const darkClass = context.theme === 'dark' ? 'class="dark"' : '';

  return `<!DOCTYPE html>
<html ${darkClass}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="${TAILWIND_CDN}"></script>
  <style>
    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; background: transparent; }
    .dark body, html.dark body { color-scheme: dark; }
  </style>
  ${bridgeScript}
</head>
<body>
  ${renderHtml}
</body>
</html>`;
}
