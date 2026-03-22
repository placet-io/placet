# Plugins

HumanProxy uses a **directory-based plugin system**. Each plugin defines a custom message type — how it looks in the chat and what logic it can run.

## How Plugins Work

A plugin consists of two files in `packages/plugins/<name>/`:

```
packages/plugins/
  hello-world/
    plugin.json      ← Manifest (metadata + input schema)
    render.html      ← Frontend template (HTML + Tailwind)
```

- **plugin.json** defines the plugin name, input schema, and permissions
- **render.html** is rendered inside a sandboxed iframe in the chat UI

Plugins are discovered automatically on backend startup. No build step required — just add the directory and restart.

---

## Creating a Plugin

### 1. Create the directory

```bash
mkdir packages/plugins/my-plugin
```

### 2. Define `plugin.json`

```json
{
  "name": "my-plugin",
  "displayName": "My Plugin",
  "description": "What this plugin does",
  "version": "1.0.0",
  "author": "Your Name",
  "icon": "sparkles",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Title to display" },
      "url":   { "type": "string", "format": "uri" }
    },
    "required": ["title"]
  },
  "permissions": {
    "httpRequests": true,
    "maxHttpDomains": ["api.example.com"]
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique plugin identifier (kebab-case) |
| `displayName` | Yes | Human-readable name |
| `version` | Yes | Semver version |
| `description` | No | Short description |
| `author` | No | Author name |
| `icon` | No | Lucide icon name |
| `inputSchema` | No | JSON Schema for the plugin's input data |
| `permissions.httpRequests` | No | Whether the plugin can make HTTP requests |
| `permissions.maxHttpDomains` | No | Allowed domains for HTTP requests (`["*"]` = any) |

### 3. Create `render.html`

```html
<div class="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
  <h3 id="title" class="font-semibold text-zinc-900 dark:text-zinc-100"></h3>
  <p id="info" class="mt-1 text-sm text-zinc-500"></p>
</div>

<script>
  const data = window.__PLUGIN_DATA__;

  document.getElementById('title').textContent = data.title;
  document.getElementById('info').textContent = data.url || 'No URL provided';

  // Tell the parent frame to resize to fit content
  HumanProxy.resize();
</script>
```

### 4. Restart the backend

```bash
make stop && make start
# or for Docker rebuild:
docker compose up -d --build
```

The plugin is automatically discovered and available at `GET /api/plugins`.

---

## Bridge API

Every plugin iframe gets a `HumanProxy` global object:

```javascript
// Access the plugin's input data
const data = window.__PLUGIN_DATA__;

// Access attached files (id, filename, mimeType, size)
const files = HumanProxy.attachments;

// Resize the iframe to fit content
HumanProxy.resize();

// Make an HTTP request (proxied through the parent)
const res = await HumanProxy.fetch('https://api.example.com/data');
const json = JSON.parse(res.body);

// Get file content as base64 data URL
const file = await HumanProxy.getFile(files[0].id);
// file = { ok: true, data: "data:image/png;base64,...", mimeType: "image/png", filename: "photo.png" }

// Get a presigned download URL (e.g. for sharing externally)
const { url } = await HumanProxy.getFileUrl(files[0].id);

// Show a toast notification
HumanProxy.toast('Action completed', 'success');

// Emit an action to the parent (e.g. for review responses)
HumanProxy.emit('respond', { approved: true });

// Listen for events from the parent
HumanProxy.on('theme-changed', (data) => { /* ... */ });
```

### Properties

| Property | Description |
|----------|-------------|
| `HumanProxy.data` | Plugin input data from the message metadata |
| `HumanProxy.attachments` | Array of attached files (`{ id, filename, mimeType, size }`) |
| `HumanProxy.message` | Message context (`id`, `channelId`, `senderType`, `createdAt`) |
| `HumanProxy.theme` | Current theme (`'light'` or `'dark'`) |

### Methods

| Method | Description |
|--------|-------------|
| `HumanProxy.getFile(attachmentId)` | Get file content as base64 data URL (for rendering, parsing) |
| `HumanProxy.getFileUrl(attachmentId)` | Get a presigned download URL (for sharing, external use) |
| `HumanProxy.fetch(url, options?)` | Proxied HTTP request (respects `maxHttpDomains`) |
| `HumanProxy.resize()` | Resize iframe to fit content |
| `HumanProxy.toast(message, type?)` | Show toast (`'info'`, `'success'`, `'warning'`, `'error'`) |
| `HumanProxy.emit(action, data?)` | Send action to parent |
| `HumanProxy.on(event, handler)` | Listen for parent events |

---

## Sending Plugin Messages (Agent API)

An agent sends a plugin message by including `metadata.plugin`:

```bash
curl -X POST https://humanproxy.example.com/api/v1/messages \
  -H "Authorization: Bearer hp_..." \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Here is the result:",
    "metadata": {
      "plugin": "my-plugin",
      "title": "Build Report",
      "url": "https://ci.example.com/builds/42"
    }
  }'
```

Plugins and reviews are independent — you can combine them:

```json
{
  "text": "Please review:",
  "metadata": { "plugin": "my-plugin", "title": "Deploy v2.1" },
  "review": {
    "type": "approval",
    "payload": {
      "options": [
        { "id": "approve", "label": "Deploy", "style": "primary" },
        { "id": "reject", "label": "Cancel", "style": "danger" }
      ]
    }
  }
}
```

---

## Built-in Plugins

| Plugin | Description |
|--------|-------------|
| `hello-world` | Minimal example — renders a greeting card |
| `status-badge` | Colored status badge with label and details |
| `crm-product` | Product card with HTTP data fetching |

---

## Security

- Plugins render in a **sandboxed iframe** (`sandbox="allow-scripts"`)
- **No access** to parent DOM, cookies, or localStorage
- HTTP requests are **proxied** through the parent and validated against `maxHttpDomains`
- Plugin HTML is loaded from disk, not user-generated
