# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.6] — 2026-04-15

### Changed

- **Dockerfile permission fix** — replaced slow `chown -R /app` layer with inline `--chown` flags on `COPY` instructions; significantly reduces build time on ARM64 runners

## [0.6.5] — 2026-04-15

### Changed

- **Multi-platform Docker image** — release workflow now builds for `linux/amd64` and `linux/arm64` using native GitHub runners (no QEMU emulation), merged into a single multi-arch manifest; `docker pull` automatically selects the correct architecture

## [0.6.4] — 2026-04-15

### Changed

- **Multi-arch Docker build (QEMU)** — initial attempt at multi-platform image via QEMU emulation; superseded by native runner approach in 0.6.5

## [0.6.3] — 2026-04-14

### Added

- **GHCR Docker image publishing** — release workflow now builds `Dockerfile.aio` and pushes to `ghcr.io` on every version tag with semver tags (`x.y.z`, `x.y`) and `latest`

## [0.6.2] — 2026-04-14

### Added

- **All-in-One Docker image** — single-container deployment via `Dockerfile.aio` with Nginx reverse proxy, bundled PostgreSQL/SQLite, and MinIO; ideal for quick self-hosting and evaluation
- **SQLite support** — AiO container can run with SQLite instead of PostgreSQL for lightweight single-node deployments (`DATABASE_PROVIDER=sqlite`)
- **Agent streaming** — new `message:delta` WebSocket event forwards LLM token deltas from agent to frontend in real-time; gateway relays agent-emitted events to channel subscribers
- **Progress / thinking indicator** — new `message:progress` WebSocket event for ephemeral tool-hint and thinking status; frontend shows spinner + context text while agent processes
- **Agent status lifecycle** — agents now report `busy` / `active` / `error` status via `POST /api/v1/status/ping`; status transitions triggered automatically on message processing start, completion, and failure

### Changed

- `events.gateway.ts` — added `@SubscribeMessage('message:delta')` and `@SubscribeMessage('message:progress')` handlers that forward agent events to `channel:{id}` room subscribers
- `use-messages` hook — accumulates `streamingContent` from delta events, tracks `progress` state, auto-clears both on `message:created`
- `MessageList` — renders streaming bubble (partial response in real-time) and thinking indicator (spinner + tool hint text) below message list
- `ChatThreadPage` — passes `streamingContent` and `progress` props through to `MessageList`

## [0.6.1] — 2026-04-07

### Changed

- **Removed `changes_requested` review status** — reviews now only have three statuses: `pending`, `completed`, `expired`. The `requestChanges` field has been removed from `RespondReviewSchema`. Agents and workflows should interpret the review response content (e.g. `response.selectedOption`) to decide whether to iterate. This simplifies the data model and keeps business logic where it belongs — in the agent, not the transport layer.
- **Webhook events simplified** — `review:changes_requested` event removed; all review responses now emit `review:responded`. Agents inspect the response payload to determine next steps.
- **Iteration target validation** — `iterationOf` target must now have a `completed` or `expired` review (previously also accepted `changes_requested`)
- **ReviewSchema extended** — `feedback` and `modifiedFileIds` fields added to the shared `ReviewSchema` for proper type safety; removed unsafe type casts in frontend components

## [0.6.0] — 2026-04-06

### Added

- **HITL iteration chains** — messages can form revision chains via `iterationOf` parameter; backend tracks `iterationGroupId` + `iteration` number with atomic `@@unique` constraint
- **Request Changes flow** — reviewers can respond with human `feedback` text alongside their response; agents interpret the response to decide whether to iterate
- **Text attachments** — `textAttachments` field on `POST /api/v1/messages` stores inline text content as file attachments in a single request (no separate upload round-trip)
- **Text enrichment** — GET endpoints automatically inline `textContent` for small text-based attachments (≤ 50 KB), eliminating extra download calls
- **Iteration chain endpoint** — `GET /api/v1/messages/iterations/:id?channel=` returns all messages in a chain sorted by iteration number
- **Store text endpoint** — `POST /api/v1/files/store-text` stores text content as file attachments without creating a message
- **Iteration timeline UI** — file preview modal and inbox detail show a scrollable iteration timeline with numbered badges; mobile uses Shadcn Select dropdown
- **Inbox redesign** — iteration grouping (shows latest revision only), collapsible message text, file tabs with inline preview, sticky review card, fullscreen file modal trigger
- **Inbox read tracking** — localStorage-backed unread indicators with colored agent names; badge count highlights when unread items exist
- **Self-fetching pending reviews bar** — fetches own data via `GET /api/messages/reviews?channel=` instead of relying on lazy-loaded chat messages; shows max 5 entries + "+N more" badge; stays in sync via WebSocket
- **MCP iteration tools** — `get_iteration_chain` tool, `iterationOf` parameter on `send_message` and `send_review_message`

### Changed

- **Review response schema** — `annotationFileId` replaced by `modifiedFileIds` (supports multiple edited files) + `feedback` field
- **Webhook retry payload** — now includes `modifiedFileIds`, `feedback`, `iterationGroupId`, and `iteration` context
- **`GET /api/messages/reviews`** — accepts optional `channel` query param to filter by agent
- **Markdown headings** — corrected heading sizes in chat message renderer

### Fixed

- **SQL injection risk** — removed `$queryRawUnsafe` for iteration numbering; `@@unique` constraint handles uniqueness
- **Feedback field path** — frontend was reading `review.response.feedback` instead of `review.feedback`; fixed in review card, inbox detail, and file preview modal
- **Iteration API auth bypass** — frontend iteration chain fetches were missing required `?channel=` query param
- **Credential leak** — `findById` endpoint stripped sensitive agent fields (`webhookAuth`, `webhookHeaders`, `webhookUrl`) before returning to client
- **Review timestamp field** — `completed_at` renamed to `completedAt` to match shared Zod schema
- **Inbox localStorage growth** — read tracking now caps at 500 entries to prevent unbounded storage growth

## [0.5.1] — 2026-04-05

### Fixed

- **Empty message validation** — reject messages with no content (no text, review, status, or attachments) at the schema level for both agent and user APIs
- **Plugin message rendering** — backend now auto-sets `metadata.plugin` from `review.payload.plugin` on freeform reviews, so plugin UIs render correctly without callers needing to duplicate data
- **Mobile message input** — compact padding on small screens, prevent Enter-to-send on mobile touch devices

## [0.5.0] — 2026-04-03

### Added

- **Webhook management API** — `POST /api/v1/agents/setWebhook` and `POST /api/v1/agents/deleteWebhook` endpoints (Telegram-style) for registering webhook URLs with custom headers and basic auth per channel
- **Inline media in markdown** — images and videos referenced by storage file ID (`![alt](/fileId)`) render inline in chat messages with expand-to-preview support
- E2E tests for webhook management endpoints (set, update, delete, validation, auth)

### Fixed

- **Light mode code blocks** — code blocks were barely visible in light mode; switched to theme-aware background and explicit border
- **SVG file preview** — SVG files were incorrectly routed to the code viewer instead of rendering as images
- **Service worker icon path** — push notification icon referenced non-existent `/icon-192.png`; corrected to `/favicons/android-chrome-192x192.png`
- **Mobile layout** — improved responsive layout across chat, inbox, files, logs, settings, and status views

## [0.4.1] — 2026-04-03

### Fixed

- **Form review select crash** — select fields with `{label, value}` object options caused React error #31; now supports both string and object option formats
- **Completed form reviews** — submitted forms now display the same form UI in read-only mode with filled values instead of raw JSON

## [0.4.0] — 2026-04-02

### Added

- **MCP server** (`@placet/mcp`) — Model Context Protocol server for AI coding agents (Claude Code, Copilot, Cursor, Windsurf) with StreamableHTTP and stdio transports, 13 tools (send_message, get_messages, get_message, delete_message, send_review_message, wait_for_review, get_pending_reviews, list_channels, create_channel, ping_status, list_plugins + dynamic plugin tools)
- Individual docs pages for each connection type (MCP, WebSocket, REST API, Webhooks)
- n8n community nodes package (`n8n-nodes-placet`)

### Changed

- **API authentication switched to `x-api-key` header** — all agent endpoints now use `x-api-key: hp_...` instead of `Authorization: Bearer`
- WebSocket gateway supports both `auth.apiKey` (agents) and `auth.token` (frontend JWT)
- OpenAPI spec auto-generated with `api-key` security scheme and 6 logical endpoint groups (Agents, Messages, Reviews, Files, Status, Plugins)
- Documentation restructured — API Reference with grouped REST endpoints + WebSocket page, Connection Types as own category, Integrations renamed to Examples
- All examples, integration docs, and curl snippets updated for `x-api-key`
- E2e tests updated to use `x-api-key` header

## [0.3.0] — 2026-03-31

### Added

- **Inbox view** — centralized review inbox across all agents with real-time updates, detail panel, and auto-navigation after response
- **Delivery status tracking** — WhatsApp-style checkmarks for message delivery (✓ sent, ✓✓ webhook delivered, ✓✓ blue agent acknowledged)
- `POST /api/v1/messages/:id/ack` — agent endpoint to explicitly acknowledge message receipt
- `POST /api/messages/:id/retry` — retry failed webhook deliveries from the UI
- `message:delivery` WebSocket event — real-time delivery status updates to the frontend
- `delivery_status` column on messages (schema: `sent` → `webhook_delivered` / `webhook_failed` → `agent_received`)
- Webhook notification on review expiry — agents now receive a `review:expired` webhook callback
- Retry button on review cards when webhook delivery fails
- Delivery status section in connection-types documentation

### Fixed

- Webhook `headers` and `auth` from agent settings were never passed to `dispatch()` — now correctly applied via `buildAgentWebhook()` helper
- Webhook auth object was created with empty values when `username`/`password` were missing — now guards against incomplete auth
- `dispatch()` was fire-and-forget (void) — now returns `{ success, statusCode }` for delivery tracking

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
