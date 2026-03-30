# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-03-30

### Added

- Documentation site with concepts, integration guides, and plugin docs
- Example projects for Python, TypeScript, LangChain, and WebSocket
- Contributor License Agreement (CLA) in `CONTRIBUTING.md`
- `DEVELOPMENT.md` — full development guidelines (setup, branching, commits, migrations, release process)
- Optional Traefik reverse proxy overlay (`docker-compose.traefik.yml`) for production deployments with automatic HTTPS via Let's Encrypt
- GitHub Actions CI pipeline (build, lint, format check, test)
- GitHub Actions release workflow — runs CI and creates GitHub Release on version tags
- Explicit `container_name` for all Docker Compose services (`placet-postgres`, `placet-backend`, etc.)

### Changed

- Renamed project from HumanProxy to Placet
- License simplified to pure AGPL-3.0 (removed custom commercial use restrictions and enterprise licensing clauses)
- Release pipeline simplified — Docker image publishing removed; users self-host via `git clone` + `make setup`
- `CONTRIBUTING.md` restructured; development setup moved to dedicated `DEVELOPMENT.md`

### Fixed

- Minor bug fixes across backend and frontend

## [0.1.0] — 2026-03-26

First public release. Core platform is working and self-hostable via Docker Compose.

### Added

#### Platform

- Chat-based inbox with real-time messaging between AI agents and humans
- Multi-agent support — create unlimited agents, each with their own chat channel
- User management with Owner/Member roles and invite system
- Dark / Light / System theme with persistent user preferences
- Responsive layout: desktop 3-column view, mobile-optimized with bottom nav
- Docker Compose setup: single `make setup` to launch everything (Postgres, MinIO, Backend, Frontend)

#### Agent API

- Push API (`POST /api/v1/messages`) — agents send text, status, attachments, reviews, and plugin messages
- Chat-as-Storage (`GET /api/v1/messages`) — agents query their own chat history (search, filters, cursor pagination)
- File API (`POST /api/v1/files/upload`, `GET /api/v1/files`) — upload, list, and download files
- Agent status heartbeat (`POST /api/v1/status/ping`) — 4 states: active, busy, error, offline
- Long-polling (`GET /api/v1/reviews/:id/wait`) — agents can wait synchronously for review responses

#### Review System

- 5 built-in review types: Approval, Selection, Form, Text Input, Freeform
- Review UI rendered inline in chat with status badges (pending / completed / expired)
- Automatic review expiry via background cron job
- Review responses delivered via webhook callback (tiered: message > agent > review-level)

#### File Handling

- S3-compatible storage via MinIO with presigned uploads
- Inline viewers for images, PDF, video, audio, DOCX, XLSX/CSV, PPTX, text/code/markdown
- Canvas annotation overlay (pen, arrow, rectangle, text, undo, colors)
- File preview modal with attachment navigation, annotation toggle, review panel
- Bulk download as ZIP archive
- Share links (JWT-based, unauthenticated download)

#### Plugin System

- Directory-based plugins: 2 files (`plugin.json` + `render.html`) = custom message type
- Sandboxed iframe rendering with `Placet.*` Bridge API
- Bridge API: `data`, `env`, `attachments`, `message`, `theme`, `review`, `isPreview`, `fetch`, `resize`, `toast`, `emit`, `respond`, `getFile`, `getFileUrl`, `on`
- Server-side HTTP proxy for plugins (`POST /api/plugins/:name/fetch`) — solves CORS
- Plugin config UI in Settings (env variables per plugin, stored in DB)
- Plugin preview mode: expand to full-screen modal with `Placet.isPreview`
- Plugin validation on startup — prevents boot with broken plugins
- CLI validator: `make validate-plugin PLUGIN=name`
- 2 example plugins: `form-submit` (form rendering + webhook submission), `kroki-diagram` (diagram rendering via Kroki)

#### Security & Auth

- JWT authentication with HttpOnly cookies (7-day expiry, refresh flow)
- API key authentication (`hp_` prefixed, SHA256 hashed, never stored in plain text)
- API key rotation (atomic update)
- Rate limiting via `@nestjs/throttler`
- SSRF protection on outbound webhooks (blocks localhost, private IPs, AWS metadata)
- Sandboxed plugin iframes (`sandbox="allow-scripts"`, no DOM/cookie access)

#### Observability

- API request logging with full request/response capture
- Configurable log format: `LOG_FORMAT=pretty` (default, colored) or `LOG_FORMAT=json` (structured)
- Global exception filter with consistent JSON error responses
- Swagger API docs at `/api/docs`
- Agent statistics (message counts, status history, uptime)

#### Communication

- WebSocket (Socket.io) — real-time message delivery, agent status, review updates
- Webhooks — outbound delivery on review responses (tiered priority, SSRF-safe)
- Long-polling — synchronous wait for review responses (30s timeout)
- Web Push notifications (VAPID) — browser notifications via Service Worker

### Known Issues

- **Webhook delivery** — outbound webhook dispatch is functional but not fully battle-tested in production scenarios. Error handling for unreachable endpoints may need refinement.
- **Mobile experience** — the responsive layout works but is not optimized for all mobile interactions. Swipe-to-reply and bottom navigation are implemented but may have edge cases on some devices.
