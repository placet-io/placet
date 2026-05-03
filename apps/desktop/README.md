# @placet/desktop

Tauri-based native desktop shell for self-hosted Placet servers.
Builds for macOS, Windows, and Linux.

The shell is intentionally tiny: it shows a "Connect to your Placet server"
screen on first launch, persists the entered URL, and then loads that
remote origin in the webview. The rest of the UI is the regular Placet
web frontend served by the user's backend.

## Requirements

- Node.js ≥ 22
- Rust (stable) — `rustup install stable`
- Platform tooling:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft C++ Build Tools, WebView2 (preinstalled on Win11)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf`

## Development

From this directory:

```sh
npm run icons   # generate platform icons (one-time, see below)
npm run dev     # run Tauri in dev mode against the local connect screen
```

The first run requires icons. They are generated from
`apps/frontend/public/favicons/apple-touch-icon.png`.

## Production build

```sh
npm run bundle
```

Bundles land under `src-tauri/target/release/bundle/`:

- macOS: `dmg/Placet_<version>_<arch>.dmg`
- Windows: `msi/Placet_<version>_x64_en-US.msi`, `nsis/Placet_<version>_x64-setup.exe`
- Linux: `deb/`, `appimage/`

## How it works

1. The Tauri app loads `shell/index.html` (the connect screen).
2. The user enters their Placet server URL (e.g. `https://placet.example.com`).
3. The URL is persisted via `tauri-plugin-store` (`placet.json`).
4. The webview navigates to that origin — cookies are first-party,
   so existing JWT-cookie auth, WebSockets, and uploads all work
   exactly as in a regular browser.
5. Native notifications: the `remote.json` capability grants the
   notification-plugin IPC to all `https://*` / `http://*` origins,
   so the loaded Placet frontend can call into the OS notification
   center via `lib/native.ts` (`notify(...)`).

## Switching servers

Currently the shell only re-shows the connect screen on launch when no
URL is saved. To switch servers, clear the app's data directory:

- macOS: `~/Library/Application Support/io.placet.desktop/`
- Windows: `%APPDATA%\io.placet.desktop\`
- Linux: `~/.local/share/io.placet.desktop/`

Or invoke the `disconnect` Tauri command from devtools:
`window.__TAURI_INTERNALS__.invoke('disconnect')`.

## Code signing

Local macOS builds use ad-hoc signing (`signingIdentity = "-"`) so the
generated `.app` bundle has a stable bundle signature for testing from
`/Applications`. The CI release workflow currently falls back to the same
ad-hoc signing when Apple Developer secrets are not configured.

Without Developer ID signing and notarization, macOS notifications may not
register reliably in System Settings. Configure these secrets once an Apple
Developer account is available:

- macOS: set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
  `APPLE_TEAM_ID` repository secrets.
- Windows: configure WiX/NSIS signing per
  <https://v2.tauri.app/distribute/sign/windows/>.
- Tauri updater: `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
