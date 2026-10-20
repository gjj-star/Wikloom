mod ai;

use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

fn strip_verbatim(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

/// 受限终端里用 WIKLOOM_STATE_DIR（或 WebView2 数据目录）兜底；
/// 普通桌面环境用 app config 目录。
fn state_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Some(dir) = std::env::var_os("WIKLOOM_STATE_DIR") {
        return PathBuf::from(dir);
    }
    if let Some(dir) = std::env::var_os("WIKLOOM_WEBVIEW_DATA_DIR") {
        return PathBuf::from(dir);
    }
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn vault_path_file(app: &tauri::AppHandle) -> PathBuf {
    state_dir(app).join("vault-path.txt")
}

fn saved_vault_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let text = std::fs::read_to_string(vault_path_file(app)).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(PathBuf::from(trimmed))
}

/// 只由 Rust 调用： canonicalize 后把目录加入 fs scope。
fn grant_directory(app: &tauri::AppHandle, path: &Path) -> Result<PathBuf, String> {
    let canonical =
        std::fs::canonicalize(path).map_err(|error| format!("无法解析文件夹路径：{error}"))?;
    if !canonical.is_dir() {
        return Err("选择的路径不是文件夹。".to_string());
    }
    let canonical = strip_verbatim(canonical);
    app.fs_scope()
        .allow_directory(&canonical, true)
        .map_err(|error| format!("无法授权访问该文件夹：{error}"))?;
    Ok(canonical)
}

/// 唯一能给 fs scope 放行目录的入口。
/// 前端不能传路径，只能触发系统目录选择框。
#[tauri::command]
async fn pick_vault(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|error| format!("打开文件夹选择框失败：{error}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let selected = file_path
        .into_path()
        .map_err(|error| format!("无法读取选择的路径：{error}"))?;

    let canonical = grant_directory(&app, &selected)?;
    let text = canonical.to_string_lossy().to_string();

    let path_file = vault_path_file(&app);
    if let Some(parent) = path_file.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(&path_file, &text).map_err(|error| format!("无法保存知识库路径：{error}"))?;

    Ok(Some(text))
}

/// 只让用户通过系统文件框选择 CLI；前端拿结果，不能指定要运行哪个文件。
#[tauri::command]
async fn pick_ai_cli(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app.dialog().file().blocking_pick_file()
    })
    .await
    .map_err(|error| format!("打开文件选择框失败：{error}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let selected = file_path
        .into_path()
        .map_err(|error| format!("无法读取选择的路径：{error}"))?;
    Ok(Some(selected.to_string_lossy().to_string()))
}

#[tauri::command]
fn get_saved_vault(app: tauri::AppHandle) -> Option<String> {
    let path = saved_vault_path(&app)?;
    if let Ok(canonical) = std::fs::canonicalize(&path) {
        let canonical = strip_verbatim(canonical);
        if canonical.is_dir() {
            let _ = app.fs_scope().allow_directory(&canonical, true);
            return Some(canonical.to_string_lossy().to_string());
        }
    }
    // 文件夹可能被删了，原样返回让前端展示「文件夹不存在」错误页。
    Some(path.to_string_lossy().to_string())
}

/// 运行时开关 WebView2 自带右键菜单；只有笔记编辑态打开，
/// 让 CodeMirror 继续用系统原生的剪切/复制/粘贴/全选。
#[cfg(windows)]
fn apply_default_context_menus(
    window: &tauri::WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    window
        .with_webview(move |webview| {
            unsafe {
                if let Ok(core) = webview.controller().CoreWebView2() {
                    if let Ok(settings) = core.Settings() {
                        let _ = settings.SetAreDefaultContextMenusEnabled(enabled);
                    }
                }
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn apply_default_context_menus(
    _window: &tauri::WebviewWindow,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn set_default_context_menus(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在。".to_string())?;
    apply_default_context_menus(&window, enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ai::AiState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pick_vault,
            pick_ai_cli,
            get_saved_vault,
            set_default_context_menus,
            ai::ai_run,
            ai::ai_cancel,
            ai::ai_detect,
            ai::ai_ollama,
            ai::ai_ollama_detect
        ])
        .setup(|app| {
            let data_dir = std::env::var_os("WIKLOOM_WEBVIEW_DATA_DIR")
                .map(PathBuf::from)
                .or_else(|| app.path().app_local_data_dir().ok())
                .unwrap_or_else(|| PathBuf::from(".wikloom-webview"));
            std::fs::create_dir_all(&data_dir)?;

            // 启动时恢复上次选中的目录，scope 不来自 webview。
            if let Some(saved) = saved_vault_path(app.handle()) {
                let _ = grant_directory(app.handle(), &saved);
            }

            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Wikloom")
            .inner_size(1280.0, 820.0)
            .min_inner_size(960.0, 600.0)
            .data_directory(data_dir)
            .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
