use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Debug, Serialize, Deserialize)]
struct ServerConfig {
    base_url: String,
}

/// Reset the saved server URL and reload the connect screen.
#[tauri::command]
async fn disconnect(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("placet.json").map_err(|e| e.to_string())?;
    store.delete("baseUrl");
    store.save().map_err(|e| e.to_string())?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.location.replace('index.html')");
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Focus the existing window when a second instance is launched.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![disconnect])
        .setup(|app| {
            // If the user has already configured a base URL, jump straight to it.
            use tauri_plugin_store::StoreExt;
            let store = app.store("placet.json")?;
            if let Some(serde_json::Value::String(url)) = store.get("baseUrl") {
                if let Some(window) = app.get_webview_window("main") {
                    let script = format!(
                        "window.location.replace({})",
                        serde_json::to_string(&url).unwrap_or_else(|_| "''".into())
                    );
                    let _ = window.eval(&script);
                }
            }

            // Notify the connect screen (or any page) that we're running natively.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("placet://desktop-ready", ());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Placet desktop");
}
