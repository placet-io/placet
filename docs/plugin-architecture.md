# HumanProxy — Plugin Architecture

## 1. Core Concept

A **Plugin** in HumanProxy defines a **custom message type**. It controls:

1. **What data a message carries** — input schema (what fields the agent sends)
2. **How that message renders** — HTML + Tailwind CSS in the frontend
3. **What logic runs client-side** — HTTP requests (send and receive), dynamic data fetching, user interactions

A Plugin does **NOT** control:

- Whether a message requires a review/response (that's the agent's decision per message)
- The approve/reject buttons (that's the review system, orthogonal to plugins)
- Authentication or routing (that's the platform)

### Plugin vs Review

These are **two independent axes** on a message:

```
Message
  ├── plugin_type: "crm-product"     ← HOW the message renders (Plugin)
  ├── review: { ... }                ← WHETHER user input is needed (Review)
  │     ├── type: "approval"         ← WHAT kind of input (built-in review types)
  │     └── payload: { options: [...] }
  └── metadata: { productId: "P-123" } ← Plugin-specific data
```

A message can have:

- **Plugin only** — renders custom UI, no user action needed (e.g. CRM product card)
- **Review only** — default message rendering + approval/selection/form buttons
- **Plugin + Review** — custom rendering + user action required
- **Neither** — plain text/markdown message

### Examples

```jsonc
// 1. Status message (no plugin, no review)
{ "text": "Deployment complete", "status": "success" }

// 2. CRM product card (plugin, no review)
{ "text": "Found this product:", "metadata": { "plugin": "crm-product", "productId": "P-123" } }

// 3. Approval request (no plugin, review)
{ "text": "Deploy to production?", "review": { "type": "approval", "payload": { "options": [{"id": "yes", "label": "Deploy"}, {"id": "no", "label": "Cancel"}] } } }

// 4. Annotate this image (plugin + review)
{ "text": "Mark issues on this mockup", "metadata": { "plugin": "image-annotator", "imageUrl": "..." }, "review": { "type": "freeform", "payload": {} } }
```

---

## 2. Plugin Structure

A plugin is a **directory** in `packages/plugins/` with this structure:

```
packages/plugins/
  crm-product/
    plugin.json          ← Manifest: metadata + input schema
    render.html          ← Frontend template (HTML + Tailwind)
    README.md            ← Optional: usage docs
```

### plugin.json — Manifest

```json
{
  "name": "crm-product",
  "displayName": "CRM Product Card",
  "description": "Renders product details fetched from a CRM API",
  "version": "1.0.0",
  "author": "HumanProxy",
  "icon": "package",

  "inputSchema": {
    "type": "object",
    "properties": {
      "productId": { "type": "string", "description": "Product ID to look up" },
      "apiBaseUrl": { "type": "string", "format": "uri", "description": "CRM API base URL" }
    },
    "required": ["productId"]
  },

  "permissions": {
    "httpRequests": true,
    "maxHttpDomains": ["*.example.com", "api.crm.io"]
  }
}
```

### render.html — Frontend Template

A self-contained HTML document rendered in a **sandboxed iframe**. The platform injects:

- **Tailwind CSS** (CDN or bundled)
- A `HumanProxy` JavaScript bridge object
- The plugin data as `window.__PLUGIN_DATA__`

```html
<div id="plugin-root" class="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
  <div id="loading" class="text-sm text-zinc-500">Loading product...</div>
  <div id="product" class="hidden">
    <div class="flex items-center gap-3">
      <img id="product-image" class="w-16 h-16 rounded object-cover" />
      <div>
        <h3 id="product-name" class="font-semibold text-zinc-900 dark:text-zinc-100"></h3>
        <p id="product-price" class="text-sm text-zinc-500"></p>
      </div>
    </div>
    <p id="product-desc" class="mt-2 text-sm text-zinc-600 dark:text-zinc-400"></p>
  </div>
</div>

<script>
  const data = window.__PLUGIN_DATA__;
  // data = { productId: "P-123", apiBaseUrl: "https://api.crm.io" }

  async function init() {
    try {
      const res = await HumanProxy.fetch(
        `${data.apiBaseUrl || 'https://api.crm.io'}/products/${data.productId}`,
      );
      const product = await res.json();

      document.getElementById('product-name').textContent = product.name;
      document.getElementById('product-price').textContent = `$${product.price}`;
      document.getElementById('product-desc').textContent = product.description;
      document.getElementById('product-image').src = product.imageUrl;
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('product').classList.remove('hidden');

      // Tell the platform the rendered height
      HumanProxy.resize();
    } catch (err) {
      document.getElementById('loading').textContent = `Error: ${err.message}`;
    }
  }

  init();
</script>
```

---

## 3. HumanProxy Bridge API

The `HumanProxy` object is injected into every plugin iframe and provides a controlled API:

```typescript
interface HumanProxyBridge {
  // ── Data ──────────────────────────────────────────────────────────
  /** Plugin input data from the message metadata */
  data: Record<string, unknown>;

  /** Message context (id, channelId, senderType, createdAt) */
  message: { id: string; channelId: string; senderType: string; createdAt: string };

  /** Current theme ('light' | 'dark') */
  theme: 'light' | 'dark';

  // ── HTTP ──────────────────────────────────────────────────────────
  /**
   * Proxied fetch — requests go through the platform's HTTP proxy.
   * Domain must match `permissions.maxHttpDomains` in plugin.json.
   * Timeout: 30s. Max response: 5MB.
   */
  fetch(url: string, options?: RequestInit): Promise<Response>;

  // ── UI ────────────────────────────────────────────────────────────
  /** Notify the parent to resize the iframe to fit content */
  resize(): void;

  /** Show a toast notification in the parent UI */
  toast(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;

  // ── Actions ───────────────────────────────────────────────────────
  /**
   * Emit a custom action to the parent (e.g. user clicked a button).
   * The parent can handle this to submit a review response, navigate, etc.
   */
  emit(action: string, payload?: Record<string, unknown>): void;

  /**
   * Listen for events from the parent (e.g. review status changes).
   */
  on(event: string, handler: (data: unknown) => void): void;
}
```

### Implementation: postMessage bridge

The bridge is implemented via `window.postMessage`:

```
┌─────────────────────┐     postMessage      ┌─────────────────────┐
│   Parent (React)     │ ◄──────────────────► │   iframe (Plugin)   │
│                      │                      │                      │
│  - Listens for       │  { type, payload }   │  - HumanProxy.fetch()│
│    'hp:fetch'        │ ──────────────────►  │    → postMessage     │
│    'hp:resize'       │                      │    'hp:fetch'        │
│    'hp:toast'        │  { type, result }    │                      │
│    'hp:emit'         │ ◄──────────────────  │  - Receives response │
│                      │                      │    via callback      │
│  - Executes fetch    │                      │                      │
│    on behalf of      │                      │                      │
│    plugin (proxy)    │                      │                      │
└─────────────────────┘                      └─────────────────────┘
```

**Why proxy fetch through the parent?**

- The iframe sandbox doesn't have `allow-same-origin`, so cookies/auth won't leak
- The parent can enforce domain allowlists from `plugin.json`
- The parent can add rate limiting, logging, timeout enforcement
- CORS issues are avoided since the parent (not the iframe) makes the actual request

---

## 4. Built-in Review Types

Reviews are **NOT plugins** — they are a built-in platform feature. The review system provides these types out of the box:

| Type         | Agent sends                                     | User sees                                           |
| ------------ | ----------------------------------------------- | --------------------------------------------------- |
| `approval`   | `options: [{id, label, style}]`                 | Buttons (Approve/Reject/etc.)                       |
| `selection`  | `mode: "single"\|"multi", items: [{id, label}]` | Radio buttons or checkboxes                         |
| `form`       | `fields: [{name, type, label, required?}]`      | Dynamic form                                        |
| `text-input` | `placeholder?, markdown?: boolean`              | Textarea                                            |
| `freeform`   | `{}`                                            | Generic JSON response (used with custom plugin UIs) |

The `freeform` type is the bridge between plugins and reviews: the plugin renders its own UI, and when the user interacts, the plugin calls `HumanProxy.emit('respond', { ... })` which submits the review response.

---

## 5. Plugin Discovery & Installation

### Approach: Directory-based discovery + declarative config

Inspired by n8n's community node system but simpler:

```
packages/plugins/
  approval/           ← Built-in (shipped with repo)
  selection/
  form/
  text-input/
  crm-product/        ← Custom/community (installed)
  weather-widget/
```

### Configuration: `plugins.json` at project root

```json
{
  "plugins": {
    "builtin": true,
    "community": [
      { "name": "humanproxy-plugin-crm", "version": "^1.0.0" },
      { "name": "humanproxy-plugin-weather", "version": "latest" }
    ]
  }
}
```

### Lifecycle

```
1. App starts (or `make setup` / `make update`)
   │
   ├─ 2. PluginDiscoveryService scans packages/plugins/
   │     Reads each plugin.json manifest
   │     Validates schemas
   │     Registers in PluginRegistry
   │
   ├─ 3. Compares community list from plugins.json
   │     If a listed plugin is not in packages/plugins/:
   │       → npm install <name>@<version> --prefix packages/plugins/<name>
   │       → Copy plugin files to packages/plugins/<name>/
   │
   └─ 4. PluginRegistry is ready
         Backend: validates incoming messages against plugin schemas
         Frontend: loads render.html for message display
```

### Backend: PluginRegistryService

```typescript
@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private plugins = new Map<string, PluginManifest>();

  async onModuleInit() {
    await this.discover();
  }

  async discover() {
    // Scan packages/plugins/*/plugin.json
    // Validate each manifest
    // Register in map
  }

  getPlugin(name: string): PluginManifest | undefined {
    return this.plugins.get(name);
  }

  validateMessageMetadata(pluginName: string, metadata: unknown): ValidationResult {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return { valid: false, errors: ['Unknown plugin'] };
    // Validate against plugin.inputSchema
  }

  getAllPlugins(): PluginManifest[] {
    return [...this.plugins.values()];
  }
}
```

### Frontend: Plugin Renderer

```typescript
// components/plugins/plugin-renderer.tsx
function PluginRenderer({ pluginName, data, message }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    // Fetch render.html for this plugin from the backend
    // GET /api/plugins/:name/render
    fetch(`/api/plugins/${pluginName}/render`)
      .then(r => r.text())
      .then(setHtml);
  }, [pluginName]);

  // Inject bridge + data into srcdoc
  const srcdoc = useMemo(() => {
    if (!html) return '';
    return buildSrcdoc(html, data, message, theme);
  }, [html, data, message, theme]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      style={{ width: '100%', border: 'none' }}
    />
  );
}
```

---

## 6. Security Model

| Concern              | Solution                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| **DOM access**       | `sandbox="allow-scripts"` — no `allow-same-origin`, no parent DOM access     |
| **Cookies/Storage**  | Sandboxed iframe has no access to parent cookies or localStorage             |
| **HTTP requests**    | Proxied through parent via postMessage; domain allowlist enforced            |
| **Script injection** | Plugin HTML is static per-plugin, not user-generated; loaded from disk       |
| **Resource limits**  | Max iframe height, fetch timeout (30s), response size limit (5MB)            |
| **Plugin trust**     | Built-in = trusted. Community = explicit install by admin + domain allowlist |

---

## 7. API Endpoints (new)

```
GET    /api/plugins                    ← List installed plugins (manifest only)
GET    /api/plugins/:name              ← Get plugin details + manifest
GET    /api/plugins/:name/render       ← Get render.html content for iframe
POST   /api/plugins/install            ← Install community plugin (admin only)
DELETE /api/plugins/:name              ← Uninstall plugin (admin only)
```

---

## 8. Agent API Usage

Agent sends a message with plugin data:

```bash
curl -X POST https://humanproxy.example.com/api/v1/messages \
  -H "Authorization: Bearer hp_..." \
  -d '{
    "text": "Found matching product:",
    "metadata": {
      "plugin": "crm-product",
      "productId": "P-42",
      "apiBaseUrl": "https://api.mycrm.io"
    }
  }'
```

Agent sends plugin + review:

```bash
curl -X POST https://humanproxy.example.com/api/v1/messages \
  -H "Authorization: Bearer hp_..." \
  -d '{
    "text": "Please review this order:",
    "metadata": {
      "plugin": "crm-product",
      "productId": "P-42"
    },
    "review": {
      "type": "approval",
      "payload": {
        "options": [
          { "id": "approve", "label": "Approve Order", "style": "primary" },
          { "id": "reject", "label": "Reject", "style": "danger" }
        ]
      },
      "callback": { "url": "https://my-agent.example.com/webhook/order-review" }
    }
  }'
```

---

## 9. Implementation Phases

### Phase 3a — Plugin Foundation (current)

- [ ] Define `PluginManifest` TypeScript interface in `packages/shared`
- [ ] Create `packages/plugins/` directory structure
- [ ] Implement `PluginRegistryService` (backend discovery + validation)
- [ ] Implement `GET /api/plugins` and `GET /api/plugins/:name/render` endpoints
- [ ] Implement `PluginRenderer` React component (sandboxed iframe + postMessage bridge)
- [ ] Build one example plugin: `crm-product` (demonstrates fetch, rendering, resize)

### Phase 3b — Built-in Review Types

- [ ] Implement review type components (approval, selection, form, text-input)
- [ ] These are React components, NOT plugins (no iframe needed)
- [ ] Review response flow: Frontend → Backend → optional webhook callback

### Phase 5 — Community Plugins

- [ ] `plugins.json` config file
- [ ] Auto-install missing plugins on startup
- [ ] Plugin settings UI in frontend
- [ ] Plugin developer documentation + template repo
