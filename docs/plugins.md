# Plugins

HumanProxy uses a **directory-based plugin system**. Each plugin defines a custom message type — how it looks in the chat and what logic it can run.

## How Plugins Work

A plugin consists of files in `packages/plugins/<name>/`:

```
packages/plugins/
  my-plugin/
    plugin.json      ← Manifest (metadata, input schema, env, permissions)
    render.html      ← Frontend template (HTML + CSS + JS)
    icon.svg         ← Optional icon file (SVG, PNG, JPG, WebP)
```

- **plugin.json** defines the plugin name, input schema, env variables, and permissions
- **render.html** is rendered inside a sandboxed iframe in the chat UI
- **icon.svg/.png** is served at `GET /api/plugins/:name/icon` and shown in the Settings UI

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
  "icon": "./icon.svg",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "url": { "type": "string" }
    },
    "required": ["title"]
  },
  "permissions": {
    "httpRequests": true,
    "maxHttpDomains": ["api.example.com"]
  },
  "env": [
    {
      "key": "API_KEY",
      "label": "API Key",
      "required": true,
      "secret": true,
      "description": "Your API key for the external service."
    },
    {
      "key": "BASE_URL",
      "label": "Base URL",
      "default": "https://api.example.com",
      "description": "Base URL of the API."
    }
  ]
}
```

| Field                        | Required | Description                                           |
| ---------------------------- | -------- | ----------------------------------------------------- |
| `name`                       | Yes      | Unique plugin identifier (kebab-case)                 |
| `displayName`                | Yes      | Human-readable name                                   |
| `version`                    | Yes      | Semver version                                        |
| `description`                | No       | Short description                                     |
| `author`                     | No       | Author name                                           |
| `icon`                       | No       | Relative file path (`./icon.svg`) or Lucide icon name |
| `inputSchema`                | No       | JSON Schema for the plugin's input data               |
| `permissions.httpRequests`   | No       | Whether the plugin can make HTTP requests             |
| `permissions.maxHttpDomains` | No       | Allowed domains for HTTP requests (`["*"]` = any)     |
| `env`                        | No       | Array of environment variable definitions (see below) |

#### Environment Variables

Each entry in the `env` array defines a configurable value:

| Field         | Required | Description                              |
| ------------- | -------- | ---------------------------------------- |
| `key`         | Yes      | Variable name (e.g. `API_KEY`)           |
| `label`       | Yes      | Human-readable label for the Settings UI |
| `required`    | No       | Whether this variable must be set        |
| `default`     | No       | Default value                            |
| `secret`      | No       | If `true`, rendered as a password field  |
| `description` | No       | Help text shown below the input          |

Env values are configured per-plugin in **Settings → Plugins** and stored in the database, version-coupled. Plugins access them at runtime via `HumanProxy.env`.

### 3. Create `render.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        font-family: sans-serif;
        padding: 16px;
        color: #1a1a19;
        background: transparent;
      }
      body.dark {
        color: #e5e5e4;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <h3 id="title"></h3>
      <p id="info"></p>
    </div>

    <script>
      document.addEventListener('DOMContentLoaded', function () {
        if (HumanProxy.theme === 'dark') document.body.classList.add('dark');

        var data = HumanProxy.data;
        document.getElementById('title').textContent = data.title;
        document.getElementById('info').textContent = data.url || 'No URL';

        // Access env values configured in Settings
        var apiKey = HumanProxy.env.API_KEY;
        var baseUrl = HumanProxy.env.BASE_URL || 'https://api.example.com';

        HumanProxy.resize();
      });
    </script>
  </body>
</html>
```

### 4. Optionally add an icon

Place an `icon.svg` (or `.png`) file in the plugin directory and reference it in `plugin.json`:

```json
{ "icon": "./icon.svg" }
```

### 5. Restart the backend

```bash
make stop && make start
```

The plugin is automatically discovered and available at `GET /api/plugins`.

### 6. Configure env values

Go to **Settings → Plugins**, expand your plugin, fill in the environment variables, and click **Save**.

---

## Bridge API

Every plugin iframe gets a `HumanProxy` global object:

```javascript
// Access the plugin's input data
var data = HumanProxy.data;

// Access environment variables (configured in Settings)
var apiKey = HumanProxy.env.API_KEY;

// Access attached files (id, filename, mimeType, size)
var files = HumanProxy.attachments;

// Access message context
var msg = HumanProxy.message; // { id, channelId, senderType, createdAt }

// Current theme
var theme = HumanProxy.theme; // 'light' or 'dark'

// Whether the plugin is rendered in the full-screen preview modal
var isPreview = HumanProxy.isPreview; // true or false

// Resize the iframe to fit content
HumanProxy.resize();

// Make an HTTP request (proxied through the backend server, respects maxHttpDomains)
HumanProxy.fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: apiKey }),
}).then(function (res) {
  var json = JSON.parse(res.body);
});

// Get file content as base64 data URL
HumanProxy.getFile(files[0].id).then(function (file) {
  // file = { ok: true, data: "data:image/png;base64,...", mimeType: "image/png", filename: "photo.png" }
});

// Get a download URL for a file
HumanProxy.getFileUrl(files[0].id).then(function (result) {
  // result = { ok: true, url: "/api/files/.../download" }
});

// Show a toast notification
HumanProxy.toast('Done!', 'success');

// Emit an action to the parent
HumanProxy.emit('respond', { approved: true });

// Access the review context (if message has a review)
var review = HumanProxy.review; // { type, status, payload } or null

// Submit a review response (one-time only, must be pending)
HumanProxy.respond({ approved: true })
  .then(function (result) {
    // result = { ok: true }
    HumanProxy.toast('Response submitted!', 'success');
  })
  .catch(function (err) {
    // err.message = 'Already responded to this review' / 'No pending review to respond to'
  });

// Listen for events from the parent
HumanProxy.on('theme-changed', function (data) {
  /* ... */
});
```

### Properties

| Property                 | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `HumanProxy.data`        | Plugin input data from the message metadata                    |
| `HumanProxy.env`         | Environment variables configured in Settings                   |
| `HumanProxy.attachments` | Array of attached files (`{ id, filename, mimeType, size }`)   |
| `HumanProxy.message`     | Message context (`id`, `channelId`, `senderType`, `createdAt`) |
| `HumanProxy.theme`       | Current theme (`'light'` or `'dark'`)                          |
| `HumanProxy.review`      | Review context (`{ type, status, payload }`) or `null`         |
| `HumanProxy.isPreview`   | `true` when rendered in the full-screen preview modal          |

### Methods

| Method                                | Description                                                  |
| ------------------------------------- | ------------------------------------------------------------ |
| `HumanProxy.fetch(url, options?)`     | Server-side proxied HTTP request (respects `maxHttpDomains`) |
| `HumanProxy.getFile(attachmentId)`    | Get file content as base64 data URL                          |
| `HumanProxy.getFileUrl(attachmentId)` | Get a download URL for a file                                |
| `HumanProxy.resize()`                 | Resize iframe to fit content                                 |
| `HumanProxy.toast(message, type?)`    | Show toast (`'info'`, `'success'`, `'warning'`, `'error'`)   |
| `HumanProxy.emit(action, data?)`      | Send action to parent                                        |
| `HumanProxy.respond(response)`        | Submit review response (one-time, returns Promise)           |
| `HumanProxy.on(event, handler)`       | Listen for parent events                                     |

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

## API Endpoints

| Method | Endpoint                    | Description                        | Auth     |
| ------ | --------------------------- | ---------------------------------- | -------- |
| GET    | `/api/plugins`              | List all installed plugins         | Required |
| GET    | `/api/plugins/:name`        | Get plugin manifest                | Required |
| GET    | `/api/plugins/:name/render` | Get render HTML + env values       | No       |
| GET    | `/api/plugins/:name/config` | Get plugin config (env values)     | Required |
| PUT    | `/api/plugins/:name/config` | Update plugin config               | Required |
| GET    | `/api/plugins/:name/icon`   | Get plugin icon file               | No       |
| POST   | `/api/plugins/:name/fetch`  | Server-side HTTP proxy for plugins | Required |

---

## Built-in Plugins

| Plugin          | Description                                              |
| --------------- | -------------------------------------------------------- |
| `form-submit`   | Form rendering + webhook submission (demonstrates fetch) |
| `kroki-diagram` | Diagram rendering via Kroki server (Mermaid, PlantUML…)  |

---

## Security

- Plugins render in a **sandboxed iframe** (`sandbox="allow-scripts"`)
- **No access** to parent DOM, cookies, or localStorage
- HTTP requests are **proxied server-side** via `POST /api/plugins/:name/fetch` — the backend validates domain allowlists and enforces permissions
- Plugin HTML is loaded from disk, not user-generated
- Env values (including secrets) are stored in the database and injected at render time

---

## Preview Mode

Plugins can be expanded into the full-screen **preview modal** (the same one used for image/file previews). Users click the expand button on the inline plugin to open it.

In preview mode:

- `HumanProxy.isPreview` is `true`
- The iframe fills the entire viewer area (no max height limit)
- `HumanProxy.resize()` is a no-op — the iframe stretches to fill available space

Use this to build responsive layouts:

```javascript
if (HumanProxy.isPreview) {
  // Full-screen layout — use flexbox, fill the viewport
  document.body.style.height = '100%';
  document.body.style.overflow = 'auto';
} else {
  // Inline layout — compact, auto-height
  HumanProxy.resize();
}
```
