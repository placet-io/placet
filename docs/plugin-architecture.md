# Placet — Plugin Architecture

## 1. Core Concept

A **Plugin** defines a **custom message type**. It controls:

1. **What data a message carries** — input schema (what fields the agent sends)
2. **How that message renders** — HTML/CSS/JS in a sandboxed iframe
3. **What logic runs client-side** — HTTP requests, data fetching, user interactions
4. **What configuration it needs** — environment variables (API keys, URLs, etc.)

A Plugin does **NOT** control:

- Whether a message requires a review/response (that's the agent's decision per message)
- The approve/reject buttons (that's the review system, orthogonal to plugins)
- Authentication or routing (that's the platform)

### Plugin vs Review

These are **two independent axes** on a message:

```
Message
  ├── metadata.plugin: "form-submit"    ← HOW the message renders (Plugin)
  ├── review: { ... }                   ← WHETHER user input is needed (Review)
  │     ├── type: "approval"            ← WHAT kind of input (built-in review types)
  │     └── payload: { options: [...] }
  └── metadata: { name: "John", ... }   ← Plugin-specific data
```

---

## 2. Plugin Structure

```
packages/plugins/
  form-submit/
    plugin.json      ← Manifest: metadata, input schema, env variables, permissions
    render.html      ← Frontend template (self-contained HTML + CSS + JS)
    icon.svg         ← Optional: plugin icon (SVG, PNG, JPG, WebP)
```

### plugin.json Schema

```json
{
  "name": "form-submit",
  "displayName": "Form Submit",
  "description": "Renders a form and submits to a webhook",
  "version": "1.0.0",
  "author": "Placet",
  "icon": "./icon.svg",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "email": { "type": "string" }
    }
  },
  "permissions": {
    "httpRequests": true,
    "maxHttpDomains": ["*"]
  },
  "env": [
    {
      "key": "WEBHOOK_URL",
      "label": "Webhook URL",
      "required": true,
      "default": "https://httpbin.org/post",
      "description": "URL to submit form data to"
    }
  ]
}
```

### Icon

The `icon` field accepts either:

- A **relative file path** starting with `./` (e.g. `"./icon.svg"`) — served via `GET /api/plugins/:name/icon`
- A **Lucide icon name** (backwards-compat, e.g. `"sparkles"`)

### Environment Variables

The `env` array defines configurable values per plugin:

| Field         | Required | Description                             |
| ------------- | -------- | --------------------------------------- |
| `key`         | Yes      | Variable name (e.g. `API_KEY`)          |
| `label`       | Yes      | Human-readable label for Settings UI    |
| `required`    | No       | Whether this variable must be set       |
| `default`     | No       | Default value                           |
| `secret`      | No       | If `true`, rendered as a password field |
| `description` | No       | Help text shown below the input         |

Env values are:

- **Stored in the database** (`PluginConfig` table), keyed by `pluginName + version`
- **Configured in Settings → Plugins** via auto-generated forms
- **Injected at render time** via `Placet.env`

---

## 3. Data Flow

```
Agent sends message via Push API
  │
  ├─ Backend receives POST /api/v1/messages
  │   metadata: { plugin: "form-submit", name: "John", email: "j@test.com" }
  │
  ├─ Backend saves message to DB, broadcasts via WebSocket
  │
  ├─ Frontend receives message, detects metadata.plugin
  │
  ├─ PluginRenderer component:
  │   ├─ Fetches GET /api/plugins/form-submit/render → { html, env }
  │   ├─ Fetches GET /api/plugins/form-submit → manifest (for permissions)
  │   ├─ Builds srcdoc: bridge script + render.html
  │   └─ Renders sandboxed iframe with srcDoc
  │
  └─ Inside iframe:
      ├─ Bridge script injects Placet global
      │   ├─ Placet.data = { name: "John", email: "j@test.com" }
      │   ├─ Placet.env = { WEBHOOK_URL: "https://httpbin.org/post" }
      │   ├─ Placet.theme = "light" | "dark"
      │   ├─ Placet.attachments = [...]
      │   ├─ Placet.message = { id, channelId, ... }
      │   ├─ Placet.review = { type, status, payload } | null
      │   └─ Placet.isPreview = false | true
      │
      └─ Plugin JS runs, uses Placet.* API
          └─ Placet.fetch() → postMessage → frontend → POST /api/plugins/:name/fetch → backend HTTP request
```

---

## 4. Placet Bridge API

The `Placet` object is injected into every plugin iframe:

```typescript
interface PlacetBridge {
  // ── Data ──────────────────────────────────
  data: Record<string, unknown>; // Plugin input data from message metadata
  env: Record<string, string>; // Environment variables from Settings
  attachments: PluginAttachmentInfo[]; // Attached files
  message: { id; channelId; senderType; createdAt };
  theme: 'light' | 'dark';
  review: { type; status; payload? } | null; // Review context (if message has a review)

  // ── HTTP ──────────────────────────────────
  fetch(url: string, options?): Promise<Response>; // Proxied, domain-restricted

  // ── File Access ──────────────────────────
  getFile(attachmentId: string): Promise<FileResult>; // Base64 data URL
  getFileUrl(attachmentId: string): Promise<UrlResult>; // Download URL

  // ── UI ────────────────────────────────────
  resize(): void; // Fit iframe to content
  toast(message: string, variant?): void; // Show notification

  // ── Actions ───────────────────────────────
  emit(action: string, data?): void; // Send to parent
  respond(response: object): Promise<Result>; // Submit review response (one-time)
  on(event: string, handler): void; // Listen from parent
}
```

### postMessage Protocol

All communication uses `window.postMessage`:

| Message Type             | Direction       | Description                      |
| ------------------------ | --------------- | -------------------------------- |
| `hp:fetch`               | iframe → parent | Initiate proxied HTTP request    |
| `hp:fetch:response`      | parent → iframe | Return fetch result              |
| `hp:getFile`             | iframe → parent | Request file content             |
| `hp:getFile:response`    | parent → iframe | Return file as base64            |
| `hp:getFileUrl`          | iframe → parent | Request download URL             |
| `hp:getFileUrl:response` | parent → iframe | Return URL                       |
| `hp:resize`              | iframe → parent | Request iframe height adjustment |
| `hp:toast`               | iframe → parent | Show toast notification          |
| `hp:emit`                | iframe → parent | Emit custom action               |
| `hp:respond`             | iframe → parent | Submit review response           |
| `hp:respond:result`      | parent → iframe | Return respond result (ok/error) |
| `hp:event`               | parent → iframe | Deliver event to plugin          |

**Why proxy fetch?** The iframe sandbox doesn't have `allow-same-origin`, so cookies/auth won't leak. HTTP requests are proxied **server-side** via `POST /api/plugins/:name/fetch` — the backend enforces domain allowlists, permissions, and timeout limits. This also avoids CORS issues since the request originates from the backend, not the browser.

---

## 5. Backend Architecture

### Plugin Discovery

`PluginsService` scans `packages/plugins/` on startup:

1. Reads each `plugin.json`, validates against `PluginManifestSchema` (Zod)
2. Reads `render.html` content
3. Registers in an in-memory `Map<string, RegisteredPlugin>`

### Plugin Config (Database)

```prisma
model PluginConfig {
  id         String   @id @default(cuid())
  pluginName String   @map("plugin_name")
  version    String
  envValues  Json     @map("env_values")  // { "KROKI_URL": "https://kroki.io" }
  enabled    Boolean  @default(true)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([pluginName, version])
  @@map("plugin_configs")
}
```

Config is **version-coupled**: when a plugin's version changes and env schema differs, existing values carry over for matching keys.

### API Endpoints

| Method | Endpoint                    | Auth     | Description                         |
| ------ | --------------------------- | -------- | ----------------------------------- |
| GET    | `/api/plugins`              | Required | List all installed plugin manifests |
| GET    | `/api/plugins/:name`        | Required | Get single plugin manifest          |
| GET    | `/api/plugins/:name/render` | No       | Get render HTML + resolved env      |
| GET    | `/api/plugins/:name/config` | Required | Get config + env schema             |
| PUT    | `/api/plugins/:name/config` | Required | Update env values                   |
| GET    | `/api/plugins/:name/icon`   | No       | Serve icon file (SVG/PNG/etc.)      |
| POST   | `/api/plugins/:name/fetch`  | Required | Server-side HTTP proxy for plugins  |

---

## 6. Frontend Architecture

### PluginRenderer Component

Located at `components/plugins/plugin-renderer.tsx`:

1. Fetches `GET /api/plugins/:name/render` → receives `{ html, env }`
2. Fetches `GET /api/plugins/:name` → receives manifest (for permissions)
3. Builds `PluginRendererContext` with data, env, attachments, message, theme
4. Calls `buildSrcdoc(html, context)` → bridge script + render HTML
5. Renders `<iframe sandbox="allow-scripts" srcDoc={srcdoc} />`
6. Listens for postMessage events (resize, toast, emit, fetch proxy, file access)

### Bridge Script

Located at `components/plugins/bridge.ts`:

- `buildBridgeScript(context)` — generates `<script>` block injecting `Placet` global
- `buildSrcdoc(html, context)` — combines bridge script + plugin render HTML
- Legacy `window.__PLUGIN_DATA__` etc. maintained as aliases

### Settings UI

Located at `components/settings/plugins-section.tsx`:

- Lists all installed plugins with icon, name, version, description
- Expandable config panel per plugin (only if `env` is defined)
- Auto-generated form from env schema (text/password inputs)
- Save → `PUT /api/plugins/:name/config`

---

## 7. Security Model

| Concern              | Solution                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| **DOM access**       | `sandbox="allow-scripts"` — no `allow-same-origin`, no parent DOM access           |
| **Cookies/Storage**  | Sandboxed iframe has no access to parent cookies or localStorage                   |
| **HTTP requests**    | Server-side proxied via `POST /api/plugins/:name/fetch`; domain allowlist enforced |
| **Script injection** | Plugin HTML is static per-plugin, not user-generated; loaded from disk             |
| **Resource limits**  | Max iframe height (800px inline, unlimited in preview), fetch timeout (30s)        |
| **Env values**       | Stored in DB, injected at render time; secret values not exposed in manifest       |

---

## 8. Built-in Review Types

Reviews are **NOT plugins** — they are built-in React components:

| Type         | Agent sends                                     | User sees             |
| ------------ | ----------------------------------------------- | --------------------- |
| `approval`   | `options: [{id, label, style}]`                 | Buttons               |
| `selection`  | `mode: "single"\|"multi", items: [{id, label}]` | Radio/checkboxes      |
| `form`       | `fields: [{name, type, label, required?}]`      | Dynamic form          |
| `text-input` | `placeholder?, markdown?`                       | Textarea              |
| `freeform`   | `{}`                                            | Generic JSON response |

The `freeform` type bridges plugins and reviews: the plugin renders custom UI, and on user interaction calls `Placet.respond({ ... })` to submit the review response programmatically. This is a one-time operation per review — the bridge enforces that `respond()` can only be called once per pending review.

---

## 9. File Layout

```
packages/
  shared/src/plugins.ts          ← Zod schemas (manifest, env, bridge types, context)
  plugins/
    form-submit/                  ← Showcase: form rendering + webhook submission
    kroki-diagram/                ← Showcase: diagram rendering via Kroki API

apps/
  backend/
    prisma/schema.prisma          ← PluginConfig model
    src/modules/plugins/
      plugins.module.ts           ← NestJS module
      plugins.service.ts          ← Discovery, config CRUD, icon resolution
      plugins.controller.ts       ← REST endpoints
      dto/
        update-plugin-config.dto.ts

  frontend/src/
    components/
      plugins/
        bridge.ts                 ← Bridge script injection
        plugin-renderer.tsx       ← Iframe renderer + postMessage handler
      settings/
        plugins-section.tsx       ← Plugin config UI in Settings
```
