# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.0] — 2026-05-03

### Added

- **LLM provider credentials in the Management Dashboard** — the credentials area now covers both generic secrets and provider-specific credentials, including API keys plus OAuth-based connections for supported LLM providers.
- **Expanded management policy controls** — the Management Dashboard now exposes the agent's tool-policy configuration more completely, including runtime policy toggles and a dedicated policy page for managing persistent allow/deny rules.
- **Tauri desktop integration** — Placet now ships with desktop-specific integration, including native notifications inside the app shell and release builds for macOS, Windows, and Linux.

### Changed

- **Management Dashboard UX** — the credentials flow was streamlined for everyday use across desktop and mobile, and upstream management API errors are surfaced more clearly in the UI.

### Fixed

- **Chat sidebar + message rendering cleanup** — chat ordering now follows latest activity in both flat and grouped sidebar views, active chats keep unread markers cleared while open, streaming bubbles reconcile more reliably with persisted messages, sidebar previews strip raw Markdown syntax, and code blocks keep the same dark-card styling in light and dark mode.
- **Desktop release artifact versions** — macOS and Windows desktop release bundles now synchronize their Tauri, npm, and Cargo versions from the Git release tag before building, so uploaded artifacts use the release version instead of the static development version.

### Notes

- **macOS desktop builds are not Developer ID signed yet** — the current local and CI desktop builds fall back to ad-hoc signing because Apple Developer credentials are not configured. The DMG can be used for testing, but macOS system notifications may not appear reliably in System Settings until Developer ID signing and notarization are enabled.

## [0.10.1] — 2026-04-27

### Added

- **Policy runtime toggles in the UI** — the new `policy_enabled` (master switch) and `policy_skip_cron` (cron bypass) flags from the upstream management runtime are now surfaced in two places:
  - **Policy page** (`/manage/[agentId]/policy`) — a new status card at the top of the page shows two `<Switch>` rows ("Tool policy enabled", "Skip policy for cron jobs") that PATCH directly to `policy/settings` and optimistically reflect the new state. The cron-skip toggle is automatically disabled while the master switch is off
  - **Settings page** (`/manage/[agentId]/settings`) — two sibling switches in the Advanced → Runtime block (next to "Unified session") let operators flip the same flags as part of the regular settings save flow
- **`PATCH api/agents/:agentId/manage/policy/settings`** — new backend proxy in `ManagePolicyController` that validates `{enabled?: boolean, skipCron?: boolean}` and forwards through `ManagementClient` to the upstream runtime's `/api/v1/policy/settings` endpoint

- **Tool-policy management page** — new `/manage/[agentId]/policy` section surfaces the persistent allow/deny rule store from the upstream `/api/v1/policy` endpoint (R11). Operators can list every rule (sorted by deny-first then alphabetical), add a new rule with action toggle (allow/deny), tool name (wildcards supported, e.g. `mcp:github:*`), and optional `key=value` parameter constraints, delete a single rule, or clear all rules. Rules show their `added_by` / `added_at` provenance and parameter constraints as inline chips
  - **Backend proxy** (`apps/backend/src/modules/agent-management/controllers/policy.controller.ts`) — new `ManagePolicyController` mounted at `api/agents/:agentId/manage/policy` with `GET` (list), `POST` (add), `DELETE` (remove rule by body), and `DELETE /all` (clear) — body validation enforces `action ∈ {allow, deny}`, non-empty `tool`, and object-shaped `params`; forwards through `ManagementClient` so the agent's bearer token never reaches the browser
  - **Sidebar + overview integration** — new "Policy" entry in the manage sidebar (`ShieldCheck` icon) and quick-link card on the per-agent overview page, matching the existing nav pattern

### Changed

- **Tool-policy management UX** — the policy page now uses the shared `ManageDataTable` instead of per-rule cards, with sortable columns, inline edit/delete row actions, and a unified create/edit dialog for rules
- **Policy dialog mobile layout** — parameter constraints now stack key over value on narrow screens instead of forcing both inputs into one row; the remove action stays accessible without compressing the fields
- **Management sub-page headers on mobile** — `ManagePane` now lets action buttons wrap onto a second row below the title/subtitle block on small screens, preserving the back button position and preventing header titles from collapsing to `...`

### Fixed

- **Duplicate `message:created` delivery for JWT clients** — `EventsGateway` now emits combined channel+user broadcasts in a single Socket.IO call so a frontend socket subscribed to both rooms receives each persisted message exactly once instead of twice
- **Duplicate chat bubbles after message persistence** — `useMessages` now de-duplicates both by persisted message id and by `clientId`, replacing optimistic/pre-existing entries with the canonical server message rather than appending a second bubble

## [0.10.0] — 2026-04-26

### Added

- **Management Dashboard** _(opt-in)_ — new `/manage` section lets operators inspect and configure every owned agent directly from the Placet UI, proxied to the agent's built-in management API. The section is gated behind a per-user `managementDashboard` preference (Settings → Management Dashboard) and hidden by default
  - **Per-agent dashboard** (`/manage/[agentId]`) — live status, uptime, last-active, token/daily usage mini-chart, connected channels (with nested sub-channels for agents that expose them, e.g. Placet HITL sub-agents), active MCP servers with connected/disabled state, and shortcuts into every sub-section
  - **Usage overview** (`/manage`) — cross-agent daily-token stacked bar chart, health probe per manageable agent, quick-filterable agent list
  - **Sub-resource editors** — full CRUD for: Credentials (with masked read-back), Cron jobs (cron / every-N-seconds / at-time, with preview of the next few fire times), MCP servers (stdio / sse / http, with live connection check), Channels (free-form JSON config with restart-required indicator), Settings (model overrides, webhook auth, per-provider API keys), Skills (zip upload), Scripts, Workspace (file tree + CodeMirror editor), A2A peers, Sessions browser, Audit timeline
  - **Backend proxy module** (`apps/backend/src/modules/agent-management/*`) — 16 NestJS controllers under `api/agents/:agentId/manage/*` that stamp the agent's stored bearer on outbound calls (never returned to the browser); per-request ownership check via `JwtAuthGuard` + scoped `findFirst({ownerId})`
  - **Daily-usage aggregator** (`/api/manage/usage/daily`) — cached (60 s TTL) cross-agent fan-out used by the dashboard charts
- **Sub-agent modeling** — `Agent.isSubagent` + `Agent.parentAgentId` schema fields and `POST /api/v1/agents/setSubagent` / `setWebhook { isSubagent, parentChannelId }` API surface. Sub-agents inherit their parent's online status link in the UI and do not appear in the top-level manageable list
- **Management credentials on `Agent`** — new `managementUrl` / `managementApiKey` fields plus `POST /api/v1/agents/setManagement`. The key is masked (`***`) on every read path and is only materialized server-side inside the management proxy
- **User preferences `managementDashboard` flag** — stored in `User.preferences`, toggled via `PATCH /api/preferences`. Controls visibility of the `/manage` entry in the desktop sidebar
- **Reusable manage components** — `<ManagePane>`, `<ManageCard>`, `<ManageDataTable>` (sortable, paginated, optional expanded-row renderer), `<MiniBarChart>`, `<StackedDailyBarChart>`, `<AuditTimeline>`, `<CodeEditor>` (CodeMirror with JS/JSON/MD/Python/YAML/HTML/CSS language packs), `<PillSwitch>`, `<Switch>` (base-ui)

### Changed

- **Managed-agent channel status ping** — `_status_ping_loop` and `send_status` now iterate every managed channel ID (root + sub-agents registered through the channel registry) and PATCH each one's `lastActiveAt` / `status` individually, so sub-agents in HITL constellations appear online in the UI instead of being stuck on whatever state they had at registration time
- **Agent overview redesign** — "Connected channels" quick-look now lists every channel as a row with the channel name on the left and the channel type on the right; sub-channels of the Placet channel are rendered as indented rows underneath their parent. "Active tools" lists MCP servers at the top level (server name + connection status + `n tools available`) instead of expanding every tool individually
- **Mobile chat input + header polish** — chat input no longer overflows on narrow viewports; header reorganized for better touch-target placement
- **Sidebar reordering + font-size pass** — manage sub-section groups reordered for frequency-of-use; typography tightened across `/manage` for consistency with the rest of the app
- **Agent status logic** — `pingStatus` now preserves `statusSince` on non-transitions (only stamps a new value when the enum state actually changes), preventing spurious "just transitioned" timestamps on every 60-second ping

### Fixed

- **`managementApiKey` leaked by `GET /api/v1/agents`** — `findAllByOwnerSimple` now routes every result through `maskAgent()`, matching every other read path. Previously an API-key-scoped caller (n8n nodes, CI scripts, integrations) could read the raw management bearer for every agent in the tenant
- **`ManageDataTable` lost React keys on every row** — the map returned a Fragment `<>` with `key` on the inner `<tr>`, so React iterated the unkeyed Fragment and re-mounted rows on every sort/paginate. Now uses `<Fragment key>` explicitly
- **"+ New channel" never persisted** — the channels page only mutated local state and never called `PUT /channels/:name`, so the new entry vanished on refresh. The button now awaits the PUT, surfaces errors, and flags restart-required on success
- **Cron "every" schedule ignored** — the schedule builder sent `{kind:'every', everyMs}` but the API shape is `{every_ms}` (snake_case); jobs would never fire. Fixed to emit `every_ms`

## [0.9.2] — 2026-04-22

### Added

- **Live status presence on chat header** — compact dot+text on mobile (no pill) and a full badge on tablet/desktop; shows last-seen threshold after 5 min of agent inactivity
- **Mobile long-press message actions** — holding a message bubble for 500 ms on touch devices reveals inline Copy + Reply icons (with haptic feedback where supported); existing swipe-to-reply gesture is preserved and takes precedence as soon as horizontal movement is detected
- **Auto-refresh for agents & inbox lists** — `useAgents` and `useInboxReviews` now poll every 60 s while the tab is visible and refetch immediately on `visibilitychange` / `focus`; keeps the sidebar's last-message / unread counts and the inbox list in sync even after socket events are missed (tab sleep, iOS PWA resume, network blips)
- **iOS PWA support for Web Push** — webmanifest now declares `start_url`, `scope`, and `id`, which iOS ≥ 16.4 requires to enable push subscriptions for home-screen installs; `SocketContext` exposes `notificationsSupported` and `iosRequiresInstall` flags; Settings → Browser notifications surfaces clear copy guiding iOS users through Safari → Share → Add to Home Screen, and disables the toggle when push is unavailable

### Changed

- **Chat header density on mobile** — header height reduced to `h-14` on mobile (`h-16` on ≥ sm); agent name is now top-aligned with the avatar; status moves below the name as a plain muted row; copy-ID button hidden on mobile and only visible on tablet/desktop to reduce clutter
- **iOS status-bar colour** — root layout adds `appleWebApp` metadata (`statusBarStyle: 'default'`) so installed PWAs honour the media-queried `viewport.themeColor` (`#f2f1ee` light / `#1a1a19` dark) instead of falling back to the manifest's single static value
- **Message bubble action rail** — hover Copy / Reply row now reserves a stable `h-5` slot and fades via `opacity` + `pointer-events` instead of toggling `display`; eliminates the vertical jitter that shifted surrounding messages on hover; spacing between icons and timestamp increased
- **Push permission prompt flow** — `requestNotifications` keeps `Notification.requestPermission()` synchronous inside the user-gesture handler (no awaited work first), which iOS Safari requires to actually show the prompt; supports both the promise and legacy callback forms

### Fixed

- **React hydration / purity** — `StatusBadge` moved `Date.now()` out of the render body into effect-managed state, satisfying `react-hooks/purity` and preventing inconsistent server/client renders of the "Last seen X ago" label

## [0.9.1] — 2026-04-21

### Fixed

- **WebSocket auth race condition** — `EventsGateway` now authenticates connections in a Socket.IO middleware (`server.use(...)`) instead of an async `handleConnection`, so `client.data.userId` is guaranteed to be set before any event handler runs. Previously, agents connecting via API key could emit `subscribe:channel` before the async DB lookup resolved, causing the handler's `if (!userId) return` guard to silently drop the join — with the result that `review:responded` and other channel-scoped events never reached the agent. Auth is now awaited before the connection is accepted. Clients with an invalid/missing key now receive a `connect_error` from the middleware instead of a post-`connect` `disconnect`; the documented requirement ("invalid or missing key → connection closed") is unchanged.
- **Duplicate agent messages on retry** — `POST /api/v1/messages` (agent endpoint) now accepts an optional `clientId` idempotency key; if the agent retries a timed-out request with the same `clientId`, the backend returns the already-persisted message instead of creating a second row; the default Placet channel send path now generates a UUID per call and includes it in every POST, eliminating the double-bubble that appeared after transient network errors

## [0.9.0] — 2026-04-21

### Added

- **OAuth relay module** _(experimental)_ — new `OAuthRelayModule` enables agents to initiate browser-based OAuth flows through Placet as a relay; includes `GET /api/v1/oauth/callback` endpoint that receives authorization codes from external OAuth providers and forwards them to the originating agent channel via Socket.IO (`oauth:code` event); pending flows are state-tracked with 10-minute TTL and automatic cleanup
- **`oauth:start` WebSocket event** — agents emit `oauth:start` with `channelId`, `state`, `provider`, and `authUrl`; Placet registers the state for callback resolution and forwards the event to the user's frontend for browser redirect
- **OAuth relay documentation** — new `connections/oauth-relay` docs page added to navigation
- **Inline HTML rendering enabled by default** — `useChatSettings` hook now defaults `inlineHtml` to `true` (was `false`); existing users with localStorage override are unaffected
- **Nginx upload limit increased** — `client_max_body_size` set to `100m` in AIO nginx config to support large file uploads (images, videos, zips)
- **Agent tags & grouped chat list** — tag support for agents in chat list and settings; collapsible tag-based groups; flat/grouped view mode toggle
- **Copy message** — copy-to-clipboard button added to message bubbles
- **Pending messages with `clientId` deduplication** — `sendMessage` generates a UUID `clientId`, optimistically inserts a local bubble, persists unconfirmed messages to `localStorage` under `placet:pending-messages:<channelId>`, and reconciles against server state on reconnect; server stores `clientId` in message metadata so retries are idempotent
- **"Unsent" message state & Resend button** — messages that fail to deliver show a "Not sent" label and a Resend button in the chat bubble; retrying resubmits the original text with the same `clientId`
- **Phone portrait guard** — new `PhonePortraitGuard` component wraps the app layout and shows a "please rotate your device" overlay on phones (≤ 767 px) in landscape orientation; portrait and desktop viewports are unaffected
- **Concurrent streaming bubbles** — each streaming delta carries an isolated `streamId`; `StreamingBubble` renders one typewriter bubble per active stream, enabling multiple simultaneous agent responses without interference; replaces the single shared streaming buffer
- **Inline HTML Attachments documentation** — added section to `docs/concepts/agents.mdx` covering iframe sandbox constraints and best practices for self-contained HTML attachments

### Fixed

- **Command palette cursor position** — selecting a slash command that accepts args now correctly moves the cursor to the end of the inserted text via `requestAnimationFrame` + `setSelectionRange`; previously the cursor could remain at position 0
- **File upload `message:created` broadcast** — `FilesService.uploadFile` now emits `message:created` via `EventsGateway` after creating the attachment record; previously file-only messages sent via `POST /api/v1/files/store` were silently dropped from WebSocket feeds
- **Quoted-reply scroll pinning** — `MessageList` detects quoted-reply messages (starting with `> **…:**`) and skips the 40%-pin behavior, keeping normal bottom-follow to prevent earlier messages appearing to vanish

### Changed

- **EventsGateway dependency** — gateway now injects `OAuthRelayService` (via `forwardRef`) to register OAuth flow states when `oauth:start` events arrive from agents
- **Chat header & input sticky positioning** — `chat-header` and `message-input` now use `sticky top-0` / `sticky bottom-0` with `z-20` and `shrink-0`; prevents them from scrolling out of view on constrained mobile viewports
- **Streaming architecture** — `use-messages` replaces the single `streamingContent: string | null` state with a `streamingMessages: StreamingMessage[]` array; `MessageList` props updated accordingly (`streamingContent` → `streamingMessages`)

## [0.8.0] — 2026-04-16

### Added

- **Slash command palette** — `MessageInput` detects `/` prefix and shows a filterable command menu; keyboard navigation (↑↓ Tab Escape Enter); matched commands are highlighted in primary color via a transparent-caret overlay; commands without args auto-send on selection
- **Agent commands API** — new `PUT /agents/:id/commands` endpoint persists slash command metadata (`command`, `description`, `acceptsArgs?`, `argHint?`) on the agent model; `commands` field added to `Agent` Prisma schema and shared types (`AgentCommandSchema`, `UpdateAgentCommandsSchema`)
- **Live command sync via WebSocket** — new `agent:commands` socket event relays updated command lists to all channel subscribers; `useCommands` hook merges seed data from REST with live socket updates
- **Agent status dot in chat header** — small colored indicator next to agent name: green (`active`), amber (`busy`), red (`error`); hidden when `offline`
- **Form review: dismiss button** — `dismissLabel` in the review payload renders a secondary outline button that responds with `{ _dismissed: true }`
- **Form review: checkbox description** — checkbox fields accept a `description` property shown as an inline label
- **External Traefik compose file** — `docker-compose.external-traefik.yml` for deployments attaching to a pre-existing Traefik network

### Changed

- **Socket reconnect reliability** — `io server disconnect` triggers a full reconnect after 1 s with a fresh ticket; `connect_error` during active reconnect refreshes the auth token on the socket; `ensureConnected` now distinguishes `disconnected` (full reconnect) from `!connected` (token-refresh + `sock.connect()`); 30 s periodic heartbeat fires while the tab is visible
- **`agent:status` socket event** — `use-agents` now propagates `statusMessage` and `statusSince` from the event payload alongside `status`
- **Form review: configurable submit label** — submit button text driven by `payload.submitLabel` (default: `Submit`)
- **Message bubble sender name** — name row is hidden when there is no status badge and no iteration context, reducing visual noise for plain assistant messages
- **Progress indicator** — shimmer text size bumped from `text-xs` to `text-sm`; initial thinking indicator text changed from "Thinking…" to "Processing"

## [0.7.0] — 2026-04-16

### Added

- **Typewriter streaming effect** — agent responses now render character-by-character with adaptive speed via new `useTypewriter` hook; replaces instant-append for a smoother reading experience
- **Shimmer status indicator** — new `ShimmerText` component with breathing opacity pulse and sequential dot animation replaces the plain spinner for progress/thinking states
- **Smart chat scroll behavior** — user messages pin at 40% from top on send, leaving visible room for the incoming response; auto-scroll follows growing content then transitions to bottom-following when it exceeds the viewport; dynamic spacer provides scroll room without permanent dead space
- **Instant "Thinking…" feedback** — `sendMessage` now immediately shows a thinking indicator so the user gets visual feedback before the server responds
- **Mobile keyboard viewport fix** — added `interactiveWidget: 'resizes-content'` to viewport config and `h-dvh overflow-hidden` body layout to prevent the mobile keyboard from pushing the entire view upward

### Changed

- **Font sizes to industry standard** — base chat text bumped from 14px to 16px (`text-sm` → `text-base`), headings scaled up (h1: 22px, h2: 20px, h3: 18px), code blocks from 12px to 13px, tables from 12px to 14px, agent header name from 14px to 16px, message input consistent 16px
- **Markdown list rendering** — switched from `list-inside` to `list-outside` with `pl-5` padding; fixes numbered lists with paragraph content rendering the number on a separate line
- **Inline HTML preview height** — iframe max-height changed from fixed 480px to dynamic `60vh`
- **File preview modal** — `TextPreview` now accepts and applies `className` from parent; HTML/markdown previews fill the full modal area instead of being capped at 65vh
- **File preview message panel** — right sidebar message text area uses `flex-1 min-h-0` to expand into available space instead of being capped at `max-h-40`
- **Streaming end handling** — `message:delta` with `streamEnd` no longer immediately clears the streaming bubble; content stays visible until `message:created` arrives, preventing a flash where the bubble disappears and reappears
- **Runtime config in AIO** — layout.tsx reads `WS_URL` / `APP_URL` (true runtime env) before falling back to `NEXT_PUBLIC_*` (build-time); `force-dynamic` export ensures Server Component re-evaluates on each request; entrypoint exports both variants
- **Nginx WebSocket routing** — changed location from `/ws` to `/socket.io/` with proper `$connection_upgrade` variable; fixes 504 timeouts when Socket.IO client connects via default path

### Fixed

- **SQLite query compatibility** — removed PostgreSQL-specific `::bigint` casts and `= ANY()` syntax in `agents.service.ts`; uses `Prisma.join()` for `IN` clauses, making unread-count and API-log queries work on both SQLite and PostgreSQL
- **Duplicate message delivery** — API-key WebSocket connections no longer join the user broadcast room in `events.gateway.ts`; prevents agents from receiving every `message:created` event twice (once via user room, once via channel room)

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
