# HumanProxy

Chat-based agent inbox for AI-human interaction. Self-hostable via Docker, SaaS-ready.

AI agents send messages, files, and review requests via API — humans respond through a modern chat UI.

---

## Local Setup

> **Prerequisites:** Git, Node.js 22+, Docker & Docker Compose

```bash
git clone https://github.com/your-org/humanproxy.git
cd humanproxy
make setup
```

`make setup` handles everything: installs dependencies, builds all packages, starts Docker services (Postgres, MinIO, Backend, Frontend), and runs database migrations.

Once complete:

| Service           | URL                            |
| ----------------- | ------------------------------ |
| **Frontend**      | http://localhost:3000          |
| **Backend API**   | http://localhost:3001          |
| **Swagger Docs**  | http://localhost:3001/api/docs |
| **MinIO Console** | http://localhost:9001          |

Default login: `admin@humanproxy.local` / `changeme` (configurable in `.env`).

### Make Commands

| Command         | Description                                           |
| --------------- | ----------------------------------------------------- |
| `make setup`    | First-time setup (install, build, Docker up, migrate) |
| `make start`    | Start all services                                    |
| `make stop`     | Stop all services                                     |
| `make update`   | Pull latest code, rebuild, migrate                    |
| `make test`     | Run unit + e2e tests                                  |
| `make lint`     | Run linter across all packages                        |
| `make validate` | Lint + format check + build                           |
| `make logs`     | Tail backend logs                                     |
| `make db-push`  | Push Prisma schema to database                        |
| `make clean`    | Remove containers, volumes, node_modules              |
| `make reset`    | Full reset (clean + setup)                            |

### Environment

All configuration lives in a single `.env` file at the project root. On first `make setup`, it is auto-created from `.env.example`. See [`.env.example`](.env.example) for available variables.

---

## Tech Stack

- **Frontend:** Next.js 16, TailwindCSS v4, shadcn/ui, TanStack Query, Zustand
- **Backend:** NestJS, Fastify, Prisma, PostgreSQL
- **Storage:** MinIO (S3-compatible)
- **Realtime:** Socket.io
- **Validation:** Zod (shared schemas between frontend & backend)
- **Monorepo:** Turborepo + npm workspaces

---

## Backend API

Full interactive docs available at `/api/docs` (Swagger). Below are the key endpoints for agent integration.

### Authentication

- **Users** authenticate via `POST /api/auth/login` → JWT in HttpOnly cookie
- **Agents** authenticate via `Authorization: Bearer hp_...` API key

### Agent Endpoints

| Method   | Endpoint                             | Description                                         |
| -------- | ------------------------------------ | --------------------------------------------------- |
| `POST`   | `/api/v1/messages`                   | Send a message (text, attachments, review request)  |
| `GET`    | `/api/v1/messages`                   | List messages (paginated, searchable)               |
| `GET`    | `/api/v1/messages/:id`               | Get a single message with review status             |
| `DELETE` | `/api/v1/messages/:id`               | Delete a message                                    |
| `POST`   | `/api/v1/files/upload`               | Get a presigned upload URL                          |
| `GET`    | `/api/v1/files`                      | List all files in the agent's chat                  |
| `GET`    | `/api/v1/files/:id/download`         | Download file directly (streamed)                   |
| `GET`    | `/api/v1/files/:id/presign-download` | Get a presigned download URL (for external sharing) |

### Example: Send a Message

```bash
curl -X POST http://localhost:3001/api/v1/messages \
  -H "Authorization: Bearer hp_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Build completed successfully",
    "status": "success"
  }'
```

### Example: Request Approval

```bash
curl -X POST http://localhost:3001/api/v1/messages \
  -H "Authorization: Bearer hp_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Deploy to production?",
    "review": {
      "type": "approval",
      "payload": {
        "options": [
          { "id": "deploy", "label": "Deploy", "style": "primary" },
          { "id": "cancel", "label": "Cancel", "style": "danger" }
        ]
      },
      "callback": {
        "url": "https://my-agent.example.com/webhook/deploy",
        "method": "POST"
      }
    }
  }'
```

### Review Types

| Type         | Description                                    |
| ------------ | ---------------------------------------------- |
| `approval`   | Buttons (Approve / Reject / custom options)    |
| `selection`  | Single or multi-select from a list             |
| `form`       | Dynamic form with typed fields                 |
| `text-input` | Free-text input with optional markdown         |
| `freeform`   | Generic response (used with custom plugin UIs) |

---

## Plugin System

Plugins define **custom message types** — how messages render in the chat and what client-side logic they can run (HTTP requests, dynamic data fetching, user interactions).

Plugins are simple: a `plugin.json` manifest and a `render.html` template, placed in `packages/plugins/`. They are discovered automatically on startup.

### Example: Sending a Plugin Message

```bash
curl -X POST http://localhost:3001/api/v1/messages \
  -H "Authorization: Bearer hp_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Found this product:",
    "metadata": {
      "plugin": "crm-product",
      "productId": "P-42",
      "apiBaseUrl": "https://api.mycrm.io"
    }
  }'
```

### Built-in Plugins

| Plugin         | Description                          |
| -------------- | ------------------------------------ |
| `hello-world`  | Minimal example — greeting card      |
| `status-badge` | Colored status badge with details    |
| `crm-product`  | Product card with HTTP data fetching |

For creating your own plugins, see **[Plugin Documentation](docs/plugins.md)**.

---

## Project Structure

```
humanproxy/
├── apps/
│   ├── backend/          ← NestJS + Fastify + Prisma
│   └── frontend/         ← Next.js 16 + TailwindCSS v4 + shadcn/ui
├── packages/
│   ├── shared/           ← Zod schemas + TypeScript types
│   └── plugins/          ← Plugin directory (auto-discovered)
├── docs/                 ← Documentation
├── docker-compose.yml
├── Makefile
├── .env.example
└── turbo.json
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
