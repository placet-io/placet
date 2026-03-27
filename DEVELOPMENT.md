# Development Guide

This document describes how to set up Placet for local development and outlines the workflows and conventions used in this project.

---

## Prerequisites

| Tool               | Version |
| ------------------ | ------- |
| **Node.js**        | >= 22   |
| **npm**            | >= 10   |
| **Docker**         | >= 24   |
| **Docker Compose** | >= 2.20 |

---

## Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-org/placet.git
cd placet

# Install all dependencies
npm install

# Copy environment variables
cp .env.example .env

# First-time setup (infrastructure + migrations + seed)
make setup
```

`make setup` starts Postgres and MinIO, generates the Prisma client, runs migrations, and seeds the database with an initial admin user.

---

## Running in Development

```bash
# Start all services (Docker infrastructure + backend + frontend)
npm run dev

# Or use Make
make start
```

| Service           | URL                            |
| ----------------- | ------------------------------ |
| **Frontend**      | http://localhost:3000          |
| **Backend API**   | http://localhost:3001          |
| **Swagger Docs**  | http://localhost:3001/api/docs |
| **MinIO Console** | http://localhost:9001          |

**Default login:** `admin@placet.local` / `changeme`

---

## Project Structure

```
placet/
├── apps/
│   ├── backend/         ← NestJS + Fastify + Prisma
│   └── frontend/        ← Next.js + TailwindCSS v4 + shadcn/ui
├── packages/
│   ├── shared/          ← Zod schemas + TypeScript types (shared between backend & frontend)
│   └── plugins/         ← Plugin directory (auto-discovered at runtime)
├── docs/                ← Extended documentation
├── .github/
│   └── workflows/       ← CI and release pipelines
├── docker-compose.yml
├── Makefile
└── turbo.json
```

---

## Make Commands

| Command                            | Description                                       |
| ---------------------------------- | ------------------------------------------------- |
| `make setup`                       | First-time setup (install, build, start, migrate) |
| `make start`                       | Start all Docker services                         |
| `make stop`                        | Stop all services                                 |
| `make update`                      | Pull latest, rebuild, migrate                     |
| `make test`                        | Run unit + e2e tests                              |
| `make lint`                        | Run ESLint across all packages                    |
| `make validate`                    | Lint + format check + build (full pre-push check) |
| `make validate-plugin PLUGIN=name` | Validate a plugin manifest and structure          |
| `make logs`                        | Tail backend logs                                 |
| `make clean`                       | Remove containers, volumes, node_modules          |
| `make reset`                       | Full reset (clean + setup)                        |

---

## Code Style

- **Formatter:** Prettier — run `npm run format` to auto-format
- **Linter:** ESLint — run `npm run lint` to check
- **Config:** Single quotes, trailing commas, semicolons, 100 char line width
- **TypeScript:** Strict mode enabled. No `any` without a comment explaining why.
- **Imports:** Absolute imports are preferred within apps. Use `@placet/shared` for cross-package types.

Always run `make validate` before pushing. The CI pipeline enforces the same checks.

---

## Database & Migrations

```bash
# Create a new migration after changing the Prisma schema
npm run prisma:migrate --workspace=@placet/backend

# Re-generate the Prisma client after schema changes
npm run prisma:generate --workspace=@placet/backend

# Open Prisma Studio (database browser)
npx prisma studio --schema=apps/backend/prisma/schema.prisma
```

Migrations are committed to the repository in `apps/backend/prisma/migrations/`. Never modify existing migration files.

---

## Testing

```bash
# Run all tests
npm run test

# Run backend tests only
npm run test --workspace=@placet/backend

# Run e2e tests (requires Docker services running)
npm run test:e2e --workspace=@placet/backend
```

All new features require tests. Bug fixes should include a regression test where possible.

---

## Plugins

Two files = a custom message type:

```
packages/plugins/my-plugin/
  plugin.json    ← Manifest (metadata, input schema, permissions)
  render.html    ← Sandboxed iframe renderer
```

Validate a plugin before submitting:

```bash
make validate-plugin PLUGIN=my-plugin
```

See [docs/plugins.md](docs/plugins.md) for the full plugin development guide.

---

## Branch & Commit Conventions

### Branches

| Pattern        | Purpose                         |
| -------------- | ------------------------------- |
| `main`         | Stable, release-ready code      |
| `feat/<name>`  | New feature                     |
| `fix/<name>`   | Bug fix                         |
| `chore/<name>` | Maintenance, dependency updates |
| `docs/<name>`  | Documentation only              |

All changes flow through pull requests into `main`. Direct pushes to `main` are not allowed (enforced via branch protection).

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add webhook retry backoff
fix: resolve WebSocket disconnect on token expiry
docs: update plugin bridge API reference
chore: bump pino to v9
```

---

## Pull Requests

- PRs must pass CI (build, lint, format check, tests) before they can be merged
- All PRs require at least one review and approval from a maintainer before merge
- Merge method: **squash and merge** — keep `main` history clean
- Include a clear description of what changed and why
- Reference related issues where applicable (`Closes #42`)

Contributions are welcome, but merging is the maintainer's responsibility. Please be patient with review turnaround.

---

## Releases

Releases are managed exclusively by the maintainer.

**Process:**

1. Update `CHANGELOG.md` — move items from `[Unreleased]` to a new `[x.y.z]` section
2. Bump the version in `package.json` (root) and `apps/backend/package.json`
3. Commit: `chore: release vX.Y.Z`
4. Tag: `git tag vX.Y.Z`
5. Push tag: `git push origin vX.Y.Z`

The release pipeline runs automatically on version tags (`v*`):

- Runs the full CI suite (build, lint, format, test)
- Creates a GitHub Release with release notes extracted from `CHANGELOG.md`

Users self-host Placet by cloning the repository and following the [Quickstart in README.md](README.md#quickstart).

---

## Environment Variables

All configuration lives in `.env` at the project root. Copy from `.env.example` on first setup.

See `.env.example` for all available variables with descriptions.

Key variables:

| Variable                | Default              | Notes                                             |
| ----------------------- | -------------------- | ------------------------------------------------- |
| `JWT_SECRET`            | —                    | Required. Generate with `openssl rand -base64 32` |
| `INITIAL_USER_EMAIL`    | `admin@placet.local` | Auto-created admin user                           |
| `INITIAL_USER_PASSWORD` | `changeme`           | Change immediately after first login              |
| `LOG_FORMAT`            | `pretty`             | `pretty` for dev, `json` for production           |
| `CORS_ORIGIN`           | `*`                  | Restrict in production                            |
