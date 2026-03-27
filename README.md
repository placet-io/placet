<p align="center">
  <img src="apps/frontend/public/logo-readme.svg" alt="Placet" width="80" height="80" />
</p>

<h1 align="center">Placet</h1>

<p align="center">
  <strong>The inbox where AI agents meet humans.</strong><br/>
  A self-hostable, plugin-driven platform for Human-in-the-Loop workflows.
</p>

<p align="center">
  <a href="#quickstart"><img src="https://img.shields.io/badge/Get%20Started-blue?style=for-the-badge" alt="Get Started" /></a>
  <a href="https://github.com/centerbitco/placet/releases"><img src="https://img.shields.io/github/v/release/centerbitco/placet?style=for-the-badge&label=Release" alt="Release" /></a>
  <a href="https://github.com/centerbitco/placet/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/centerbitco/placet/ci.yml?style=for-the-badge&label=CI" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

---

## Why Placet?

AI agents are getting more capable every day — but they still need humans in the loop. Approvals, reviews, feedback, complex decisions. Today, most teams wire this through Slack, Teams, or email — tools designed for human-to-human chat, not human-to-agent collaboration.

**The problem:**

- Messenger apps aren't built for structured agent interactions. An approval button in Slack is a hack, not a feature.
- AI can do much more than send text messages. Agents generate images, diagrams, documents, code — but there's no good way to review and respond to rich content inline.
- Reviewing files (images, PDFs, documents) requires switching to external services. Annotations, comparisons, and approvals happen outside the conversation.
- Every integration requires custom glue code. There's no standard way for agents to present custom UIs.

**Placet is different:**

- **Purpose-built for Human-in-the-Loop.** Not a chat app with agent integrations bolted on — the entire platform is designed around the agent-human interaction loop.
- **Rich message types out of the box.** Agents send structured reviews (approval buttons, forms, selections, free text), files with inline preview, and custom plugin UIs — all rendered natively in the chat.
- **Everything reviewable in one place.** Images, PDFs, video, documents, spreadsheets — all viewable and annotatable directly in the conversation. No context switching.
- **Plugin system for unlimited flexibility.** Two files (`plugin.json` + `render.html`) = a custom message type. Build CRM cards, diagram renderers, diff viewers, or whatever your workflow needs. Plugins run in sandboxed iframes with a full Bridge API.
- **Multiple communication channels.** WebSocket for real-time, webhooks for async delivery, long-polling for synchronous agents. Your agent connects however it wants.
- **Self-hostable, no vendor lock-in.** One `docker compose up` and you're running. No cloud dependency, no LLM provider coupling. Placet connects to _your_ systems, not the other way around.

---

## Quickstart

> **Prerequisites:** Git, Node.js 22+, Docker & Docker Compose

```bash
git clone https://github.com/centerbitco/placet.git
cd placet
make setup
```

That's it. `make setup` installs dependencies, builds packages, starts all Docker services (Postgres, MinIO, Backend, Frontend), runs migrations, and creates the initial user.

| Service           | URL                            |
| ----------------- | ------------------------------ |
| **Frontend**      | http://localhost:3000          |
| **Backend API**   | http://localhost:3001          |
| **Swagger Docs**  | http://localhost:3001/api/docs |
| **MinIO Console** | http://localhost:9001          |

**Default login:** `admin@placet.local` / `changeme` (configurable in `.env`)

### Send your first agent message

1. Go to **Settings → API Keys** and create a key
2. Go to **Settings → Agents** and create an agent
3. Send a message:

```bash
curl -X POST http://localhost:3001/api/v1/messages \
  -H "Authorization: Bearer hp_your-key-here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from my agent!", "status": "success"}'
```

4. Open the agent's chat — your message appears in real-time.

### Request human approval

```bash
curl -X POST http://localhost:3001/api/v1/messages \
  -H "Authorization: Bearer hp_your-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Deploy v2.1 to production?",
    "review": {
      "type": "approval",
      "payload": {
        "options": [
          {"id": "deploy", "label": "Deploy", "style": "primary"},
          {"id": "cancel", "label": "Cancel", "style": "danger"}
        ]
      }
    }
  }'
```

---

## Features

### Agent Communication

| Feature             | Description                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Push API**        | Agents send messages via `POST /api/v1/messages` — text, status, attachments, reviews, plugins |
| **Chat-as-Storage** | Agents query their own chat history with search, filters, and cursor pagination                |
| **Agent Status**    | Heartbeat endpoint with 4 states (active, busy, error, offline) and status history             |
| **WebSocket**       | Real-time delivery via Socket.io — messages, reviews, agent status                             |
| **Webhooks**        | Outbound delivery on review responses with tiered priority and SSRF protection                 |
| **Long-polling**    | Synchronous wait for review responses (30s timeout)                                            |
| **Web Push**        | Browser push notifications via Service Worker + VAPID                                          |

### Review System

| Type           | Agent sends                                | User sees                              |
| -------------- | ------------------------------------------ | -------------------------------------- |
| **Approval**   | `options: [{id, label, style}]`            | Styled buttons with optional comment   |
| **Selection**  | `mode: "single"\|"multi", items: [...]`    | Radio buttons or checkboxes            |
| **Form**       | `fields: [{name, type, label, required?}]` | Dynamic form with validation           |
| **Text Input** | `placeholder?, markdown?`                  | Textarea with markdown preview         |
| **Freeform**   | `{}`                                       | Generic JSON response (for plugin UIs) |

Reviews support optional expiry, webhook callbacks, and can be combined with plugin messages.

### File Handling

| Feature                 | Supported Formats                          |
| ----------------------- | ------------------------------------------ |
| **Image viewer**        | JPG, PNG, GIF, WebP, SVG                   |
| **PDF viewer**          | PDF (browser-native)                       |
| **Video player**        | MP4, WebM                                  |
| **Audio player**        | MP3, WAV, OGG                              |
| **Document viewer**     | DOCX                                       |
| **Spreadsheet viewer**  | XLSX, CSV                                  |
| **Presentation viewer** | PPTX (text extraction)                     |
| **Code/text viewer**    | Any text file with syntax highlighting     |
| **Canvas annotation**   | Pen, arrow, rectangle, text — on any image |
| **Bulk download**       | ZIP archive of selected files              |
| **Share links**         | JWT-based unauthenticated download links   |

### Plugin System

Two files = a custom message type. No build step required.

```
packages/plugins/my-plugin/
  plugin.json      ← Manifest (metadata, input schema, permissions, env)
  render.html      ← HTML + CSS + JS rendered in sandboxed iframe
```

Plugins get a `Placet` global with a full Bridge API:

```javascript
Placet.data; // Plugin input data from the agent
Placet.env; // Configured environment variables
Placet.attachments; // Attached files
Placet.message; // Message context (id, channelId, senderType)
Placet.theme; // 'light' or 'dark'
Placet.isPreview; // true when in full-screen preview modal
Placet.fetch(url); // Server-side proxied HTTP (solves CORS)
Placet.respond(data); // Submit review response programmatically
Placet.toast(msg); // Show notification
Placet.resize(); // Auto-fit iframe height
```

#### Built-in Plugins

| Plugin            | Description                                                     | Uses                              |
| ----------------- | --------------------------------------------------------------- | --------------------------------- |
| **form-submit**   | Renders a form from structured data, submits to a webhook       | `Placet.fetch`, env variables     |
| **kroki-diagram** | Renders diagrams (Mermaid, PlantUML, D2, etc.) via Kroki server | `Placet.fetch`, server-side proxy |

For the full plugin development guide, see **[Plugin Documentation](docs/plugins.md)**.

### Security

- Sandboxed plugin iframes (`allow-scripts` only — no DOM, cookie, or storage access)
- API keys: `hp_` prefixed, SHA256-hashed, never stored in plain text
- JWT authentication with HttpOnly secure cookies
- SSRF protection on outbound webhooks
- Rate limiting on all endpoints
- Server-side HTTP proxy for plugins (no direct browser requests)

---

## Production Deployment with Traefik

Placet ships with an optional [Traefik](https://traefik.io/) reverse proxy overlay for production deployments with automatic HTTPS.

**1. Configure your domain:**

Add these to your `.env`:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.traefik.yml
DOMAIN=placet.example.com
ACME_EMAIL=admin@example.com

# Update these to match your domain
NEXT_PUBLIC_WS_URL=https://placet.example.com
NEXT_PUBLIC_APP_URL=https://placet.example.com
CORS_ORIGIN=https://placet.example.com
```

**2. Start with Traefik:**

```bash
make start
# or directly:
docker compose up -d --build
```

With `COMPOSE_FILE` set, Docker Compose automatically merges both files. Traefik will:

- Obtain a Let's Encrypt TLS certificate for your domain
- Route `https://your-domain.com` → Frontend
- Route `https://your-domain.com/api/*` → Backend API
- Route `https://your-domain.com/socket.io/*` → WebSocket
- Redirect HTTP → HTTPS

> **Firewall:** The base compose file still exposes direct ports (3000, 3001, 9000, 9001). Use a firewall (ufw, iptables, cloud security group) to block external access — only ports 80 and 443 should be publicly reachable.

> **DNS:** Point your domain's A record to your server's IP before starting.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│              Next.js 16 · TailwindCSS v4 · shadcn/ui         │
│                  Socket.io · TanStack Query                  │
└──────────────────────┬───────────────────────────────────────┘
                       │ /api/* proxy
┌──────────────────────▼───────────────────────────────────────┐
│                         Backend                              │
│             NestJS · Fastify · Prisma · Socket.io            │
├──────────────┬──────────────────┬────────────────────────────┤
│  PostgreSQL  │      MinIO       │     Plugin Directory       │
│   (data)     │   (file storage) │  (packages/plugins/*)      │
└──────────────┴──────────────────┴────────────────────────────┘
```

### Tech Stack

| Layer          | Technology                                                               |
| -------------- | ------------------------------------------------------------------------ |
| **Frontend**   | Next.js 16, React 19, TailwindCSS v4, shadcn/ui, TanStack Query, Zustand |
| **Backend**    | NestJS 11, Fastify, Prisma 7, Socket.io                                  |
| **Database**   | PostgreSQL 16                                                            |
| **Storage**    | MinIO (S3-compatible)                                                    |
| **Validation** | Zod (shared schemas between frontend & backend)                          |
| **Monorepo**   | Turborepo + npm workspaces                                               |
| **Container**  | Docker + Docker Compose                                                  |

---

## Project Structure

```
placet/
├── apps/
│   ├── backend/          ← NestJS + Fastify + Prisma
│   └── frontend/         ← Next.js 16 + TailwindCSS v4 + shadcn/ui
├── packages/
│   ├── shared/           ← Zod schemas + TypeScript types
│   └── plugins/          ← Plugin directory (auto-discovered)
│       ├── form-submit/
│       └── kroki-diagram/
├── docs/
│   ├── plugins.md        ← Plugin development guide
│   └── plugin-architecture.md
├── docker-compose.yml
├── Makefile
├── .env.example
└── turbo.json
```

---

## Make Commands

| Command                            | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `make setup`                       | First-time setup (install, build, Docker up, migrate) |
| `make start`                       | Start all services                                    |
| `make stop`                        | Stop all services                                     |
| `make update`                      | Pull latest, rebuild, migrate                         |
| `make test`                        | Run unit + e2e tests                                  |
| `make lint`                        | Run linter across all packages                        |
| `make validate`                    | Lint + format check + build                           |
| `make validate-plugin PLUGIN=name` | Validate a plugin manifest and structure              |
| `make logs`                        | Tail backend logs                                     |
| `make clean`                       | Remove containers, volumes, node_modules              |
| `make reset`                       | Full reset (clean + setup)                            |

---

## Configuration

All configuration lives in `.env` at the project root. Created automatically on first `make setup` from [`.env.example`](.env.example).

| Variable                | Default              | Description                                                                  |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `LOG_FORMAT`            | `pretty`             | Log output format: `pretty` (colored, human-readable) or `json` (structured) |
| `LOG_LEVEL`             | `info`               | Log level: `debug`, `info`, `warn`, `error`                                  |
| `JWT_SECRET`            | —                    | **Required.** Secret for JWT signing                                         |
| `INITIAL_USER_EMAIL`    | `admin@placet.local` | Email for the auto-created admin user                                        |
| `INITIAL_USER_PASSWORD` | `changeme`           | Password for the auto-created admin user                                     |
| `CORS_ORIGIN`           | `*`                  | Allowed origins (comma-separated for production)                             |

See [`.env.example`](.env.example) for all available variables including database, MinIO, and push notification settings.

---

## API Documentation

Interactive Swagger docs are available at **`/api/docs`** when the backend is running.

For the Agent API reference, see the [Swagger docs](http://localhost:3001/api/docs).
For the Plugin development guide, see [docs/plugins.md](docs/plugins.md).
For the Plugin architecture overview, see [docs/plugin-architecture.md](docs/plugin-architecture.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to submit PRs.
See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup, conventions, and workflows.

## License

Placet is open source under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

You are free to use, modify, and distribute Placet under the terms of the AGPL-3.0. If you modify Placet and make it available over a network (e.g., as a SaaS), you must release your modifications under the same license.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor terms.
