use tauri::{Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "macos")]
use std::{ptr::NonNull, sync::mpsc, time::Duration};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_notification::PermissionState;

// Injected into every frame (including the user's remote Placet origin)
// before any page script runs. This is the only reliable way to expose
// "I'm in the desktop shell" to the web frontend — userAgent overrides
// and `__TAURI__` globals can be unreliable across navigations to remote
// origins, but `initialization_script_for_all_frames` is guaranteed to
// run on every top-level navigation.
#[cfg(target_os = "macos")]
const DESKTOP_INIT_SCRIPT: &str = "try{document.documentElement.dataset.placetDesktop='true';document.documentElement.dataset.placetDesktopOs='macos';window.__placetDesktop=true;}catch(e){}";
#[cfg(target_os = "windows")]
const DESKTOP_INIT_SCRIPT: &str = "try{document.documentElement.dataset.placetDesktop='true';document.documentElement.dataset.placetDesktopOs='windows';window.__placetDesktop=true;}catch(e){}";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const DESKTOP_INIT_SCRIPT: &str = "try{document.documentElement.dataset.placetDesktop='true';document.documentElement.dataset.placetDesktopOs='linux';window.__placetDesktop=true;}catch(e){}";

fn save_base_url_and_navigate(app: &tauri::AppHandle, url: &str) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("placet.json") {
        store.set("baseUrl", url.to_string());
        let _ = store.save();
    }
    if let Some(window) = app.get_webview_window("main") {
        let script = format!(
            "window.location.replace({})",
            serde_json::to_string(url).unwrap_or_else(|_| "''".into())
        );
        let _ = window.eval(&script);
    }
}

fn clear_base_url_and_show_connect(app: &tauri::AppHandle) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("placet.json") {
        store.delete("baseUrl");
        let _ = store.save();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.location.replace('index.html')");
    }
}

fn dispatch_notification_permission_result(app: &tauri::AppHandle, nonce: &str, granted: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let detail = serde_json::json!({
            "nonce": nonce,
            "granted": granted,
        });
        let script = format!(
            "window.dispatchEvent(new CustomEvent('placet:native-notification-permission', {{ detail: {} }}))",
            detail
        );
        let _ = window.eval(&script);
    }
}

fn request_notification_permission(app: &tauri::AppHandle, nonce: &str) {
    let granted = request_system_notification_permission_sync(app).unwrap_or(false);
    dispatch_notification_permission_result(app, nonce, granted);
}

#[cfg(target_os = "macos")]
fn macos_notification_status_is_granted(status: objc2_user_notifications::UNAuthorizationStatus) -> bool {
    matches!(
        status,
        objc2_user_notifications::UNAuthorizationStatus::Authorized
            | objc2_user_notifications::UNAuthorizationStatus::Provisional
            | objc2_user_notifications::UNAuthorizationStatus::Ephemeral
    )
}

#[cfg(target_os = "macos")]
fn macos_notification_permission_granted() -> Result<bool, String> {
    use block2::RcBlock;
    use objc2_user_notifications::{UNNotificationSettings, UNUserNotificationCenter};

    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (sender, receiver) = mpsc::channel();
    let completion = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let granted = unsafe { macos_notification_status_is_granted(settings.as_ref().authorizationStatus()) };
        let _ = sender.send(granted);
    });

    center.getNotificationSettingsWithCompletionHandler(&completion);
    receiver
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Timed out while checking notification permissions.".to_string())
}

#[cfg(target_os = "macos")]
fn macos_request_notification_permission() -> Result<bool, String> {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_foundation::NSError;
    use objc2_user_notifications::{UNAuthorizationOptions, UNUserNotificationCenter};

    let center = UNUserNotificationCenter::currentNotificationCenter();
    let options = UNAuthorizationOptions::Alert
        | UNAuthorizationOptions::Sound
        | UNAuthorizationOptions::Badge;
    let (sender, receiver) = mpsc::channel();
    let completion = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
        let _ = sender.send(granted.as_bool());
    });

    center.requestAuthorizationWithOptions_completionHandler(options, &completion);
    receiver
        .recv_timeout(Duration::from_secs(30))
        .map_err(|_| "Timed out while requesting notification permissions.".to_string())
}

fn request_system_notification_permission_sync(_app: &tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let granted = macos_request_notification_permission()?;
        if granted {
            return Ok(true);
        }
        return macos_notification_permission_granted();
    }

    #[cfg(not(target_os = "macos"))]
    {
        _app.notification()
            .request_permission()
            .map(|state| matches!(state, PermissionState::Granted))
            .map_err(|err| err.to_string())
    }
}

fn system_notification_permission_granted_sync(_app: &tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        return macos_notification_permission_granted();
    }

    #[cfg(not(target_os = "macos"))]
    {
        _app.notification()
            .permission_state()
            .map(|state| matches!(state, PermissionState::Granted))
            .map_err(|err| err.to_string())
    }
}

fn show_notification(app: &tauri::AppHandle, title: &str, body: Option<&str>) {
    let mut builder = app.notification().builder().title(title);
    if let Some(body) = body.filter(|value| !value.is_empty()) {
        builder = builder.body(body);
    }
    let _ = builder.show();
}

fn open_notification_settings(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        #[allow(deprecated)]
        app.shell()
            .open(
                "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
                None,
            )
            .map_err(|err| err.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }

    Ok(())
}

/// Reset the saved server URL and reload the connect screen.
#[tauri::command]
async fn disconnect(app: tauri::AppHandle) -> Result<(), String> {
    clear_base_url_and_show_connect(&app);
    Ok(())
}

/// Persist a new server URL and navigate the webview to it.
#[tauri::command]
async fn set_server_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    save_base_url_and_navigate(&app, &url);
    Ok(())
}

/// Open the OS notification settings pane, when supported.
#[tauri::command]
async fn open_system_notification_settings(app: tauri::AppHandle) -> Result<(), String> {
    open_notification_settings(&app)
}

/// Ask the OS to register Placet for system notifications.
#[tauri::command]
async fn request_system_notification_permission(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || request_system_notification_permission_sync(&app))
        .await
        .map_err(|err| err.to_string())?
}

/// Check whether the OS currently allows Placet system notifications.
#[tauri::command]
async fn is_system_notification_permission_granted(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || system_notification_permission_granted_sync(&app))
        .await
        .map_err(|err| err.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            disconnect,
            set_server_url,
            open_system_notification_settings,
            request_system_notification_permission,
            is_system_notification_permission_granted
        ])
        .setup(|app| {
            use tauri_plugin_store::StoreExt;

            // Decide initial URL: stored baseUrl if present, else the
            // bundled connect screen.
            let store = app.store("placet.json")?;
            let initial_url = match store.get("baseUrl") {
                Some(serde_json::Value::String(url)) => WebviewUrl::External(url.parse()?),
                _ => WebviewUrl::App("index.html".into()),
            };

            // Build the main window in Rust so we can attach
            // `initialization_script_for_all_frames` — config-defined
            // windows can't carry init scripts.
            let navigation_app_handle = app.handle().clone();
            let mut builder = WebviewWindowBuilder::new(app, "main", initial_url)
                .title("Placet")
                .inner_size(1280.0, 820.0)
                .min_inner_size(720.0, 480.0)
                .resizable(true)
                .center()
                .shadow(true)
                .on_navigation(move |url| {
                    if url.scheme() != "placet" {
                        return true;
                    }

                    match url.host_str() {
                        Some("set-server-url") => {
                            if let Some((_, value)) =
                                url.query_pairs().find(|(key, _)| key == "url")
                            {
                                save_base_url_and_navigate(&navigation_app_handle, value.as_ref());
                            }
                            false
                        }
                        Some("disconnect") => {
                            clear_base_url_and_show_connect(&navigation_app_handle);
                            false
                        }
                        Some("request-notification-permission") => {
                            let nonce = url
                                .query_pairs()
                                .find(|(key, _)| key == "nonce")
                                .map(|(_, value)| value.into_owned())
                                .unwrap_or_default();
                            let app_handle = navigation_app_handle.clone();
                            tauri::async_runtime::spawn_blocking(move || {
                                request_notification_permission(&app_handle, &nonce);
                            });
                            false
                        }
                        Some("notify") => {
                            let title = url
                                .query_pairs()
                                .find(|(key, _)| key == "title")
                                .map(|(_, value)| value.into_owned())
                                .unwrap_or_else(|| "Placet".to_string());
                            let body = url
                                .query_pairs()
                                .find(|(key, _)| key == "body")
                                .map(|(_, value)| value.into_owned());
                            show_notification(&navigation_app_handle, &title, body.as_deref());
                            false
                        }
                        Some("open-notification-settings") => {
                            let _ = open_notification_settings(&navigation_app_handle);
                            false
                        }
                        _ => false,
                    }
                })
                .initialization_script_for_all_frames(DESKTOP_INIT_SCRIPT);

            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
            }

            let _window = builder.build()?;

            // Listen for server-URL changes coming from the web frontend
            // (e.g. the login page's "Server settings" modal).
            let app_handle = app.handle().clone();
            app.listen("placet://set-server-url", move |event| {
                if let Ok(url) = serde_json::from_str::<String>(event.payload()) {
                    save_base_url_and_navigate(&app_handle, &url);
                }
            });

            let app_handle_disconnect = app.handle().clone();
            app.listen("placet://disconnect", move |_event| {
                clear_base_url_and_show_connect(&app_handle_disconnect);
            });

            let app_handle_notifications = app.handle().clone();
            app.listen("placet://open-notification-settings", move |_event| {
                let _ = open_notification_settings(&app_handle_notifications);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Placet desktop");
}
