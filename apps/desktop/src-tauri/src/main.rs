// Placet desktop shell — entry points.
//
// The shell is intentionally tiny: it loads a local connect screen
// (`shell/index.html`) on first launch so the user can enter the URL of
// their self-hosted Placet server, persists the URL via the store
// plugin, and then navigates the webview to that remote origin. The
// rest of the UI is the regular Placet web frontend served by the
// user's backend.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    placet_desktop_lib::run();
}
