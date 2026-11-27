//! 托盘和系统热键只发出意图；窗口隐藏和退出须经编辑器已有的保存流程。
use crate::language::tr;
use crate::storage::Library;
use serde::{Deserialize, Serialize};
use std::{env, error::Error, io, sync::Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut};
use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE},
    RegKey,
};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE: &str = "QuanY";
const LEGACY_VALUE: &str = "Jianji";
type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

struct Geometry {
    at: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    maximized: bool,
}
pub struct Standby {
    full: Mutex<Option<Geometry>>,
    bindings: Mutex<Bindings>,
}
#[derive(Clone, Serialize)]
pub struct Binding {
    key: String,
    issue: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct Bindings {
    quick: Binding,
    main: Binding,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Quick,
    Main,
}
fn register(app: &AppHandle, target: Target, shortcut: Shortcut) -> Result<()> {
    // 安装旧设置和录入新设置都经过这里，避免全局键截走其他应用的大写输入。
    if shortcut.mods == Modifiers::SHIFT
        && !shortcut
            .key
            .to_string()
            .strip_prefix('F')
            .is_some_and(|n| n.parse::<u8>().is_ok())
    {
        return Err(tr(
            "此组合键用于文字输入。",
            "This shortcut is used for typing.",
        )
        .into());
    }
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                signal(
                    app,
                    match target {
                        Target::Quick => "quick",
                        Target::Main => "full",
                    },
                );
            }
        })?;
    Ok(())
}

fn launch_command() -> io::Result<String> {
    let mut args = vec![
        format!("\"{}\"", env::current_exe()?.display()),
        "--background".into(),
    ];
    if let Some(path) = env::args_os().skip_while(|arg| arg != "--workspace").nth(1) {
        // 绝对化并消去结尾的反斜杠，避免 Windows 参数引号被转义。
        let path = std::path::absolute(path)?;
        args.push("--workspace".into());
        args.push(format!("\"{}\"", path.join(".").display()));
    }
    Ok(args.join(" "))
}

/// 正式版接管同目录旧程序的启动命令，独立稿本和用户自定义命令不参与升级。
fn upgrade_startup_command() -> io::Result<()> {
    let exe = env::current_exe()?;
    if env::args_os().any(|arg| arg == "--workspace")
        || !exe
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("QuanY.exe"))
    {
        return Ok(());
    }
    let run = match RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(RUN, KEY_READ) {
        Ok(run) => run,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    let previous = format!(
        "\"{}\" --background",
        exe.with_file_name("笺记.exe").display()
    );
    let current = launch_command()?;
    match run.get_value::<String, _>(LEGACY_VALUE) {
        Ok(command) if command == previous || command == current => {}
        Ok(_) => return Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    }
    match run.get_value::<String, _>(VALUE) {
        Ok(command) if command != current => return Ok(()),
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    // 任务管理器按值名保存禁用状态，迁移时先复制该状态，再发布新的启动项。
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let approval_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    match hkcu
        .open_subkey(approval_path)
        .and_then(|key| key.get_raw_value(LEGACY_VALUE))
    {
        Ok(state) => {
            let key = hkcu.open_subkey_with_flags(approval_path, KEY_SET_VALUE)?;
            key.set_raw_value(VALUE, &state)?;
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let run = hkcu.open_subkey_with_flags(RUN, KEY_SET_VALUE)?;
    run.set_value(VALUE, &current)?;
    run.delete_value(LEGACY_VALUE)
}

fn startup_enabled() -> io::Result<bool> {
    let run = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(RUN, KEY_READ);
    let value = run.and_then(|key| key.get_value::<String, _>(VALUE));
    match value {
        Ok(cmd) => Ok(cmd == launch_command()?),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

/// 设置当前用户登录后的后台启动项，仅管理泉涌自己的注册表值。
#[tauri::command]
pub fn set_autostart(enabled: bool) -> std::result::Result<bool, String> {
    (|| -> io::Result<bool> {
        if startup_enabled()? == enabled {
            return Ok(enabled);
        }
        let (run, _) =
            RegKey::predef(HKEY_CURRENT_USER).create_subkey_with_flags(RUN, KEY_SET_VALUE)?;
        if enabled {
            run.set_value(VALUE, &launch_command()?)?;
        } else {
            run.delete_value(VALUE)?;
        }
        startup_enabled()
    })()
    .map_err(|e| {
        format!(
            "{} {e}",
            tr(
                "无法更新登录启动项：",
                "Could not update startup at sign-in:"
            )
        )
    })
}

#[derive(Serialize)]
pub struct Preferences {
    bindings: Bindings,
    autostart: bool,
    compact: bool,
}
/// 读取注册表的实际状态及系统热键注册结果。
#[tauri::command]
pub async fn standby_settings(
    state: State<'_, Standby>,
) -> std::result::Result<Preferences, String> {
    Ok(Preferences {
        bindings: state.bindings.lock().expect("快捷键锁损坏").clone(),
        autostart: startup_enabled().map_err(|e| e.to_string())?,
        compact: state.full.lock().expect("窗口状态锁损坏").is_some(),
    })
}

/// 先注册新键，再释放旧键；冲突时保留原来的唤出方式。
#[tauri::command]
pub async fn bind_summon(
    app: AppHandle,
    state: State<'_, Standby>,
    library: State<'_, Library>,
    key: String,
    target: Target,
) -> std::result::Result<Binding, String> {
    let next: Shortcut = key
        .parse()
        .map_err(|e| format!("{} {e}", tr("快捷键格式无效：", "Invalid shortcut:")))?;
    if next.mods.is_empty() {
        return Err(tr(
            "全局快捷键需要修饰键。",
            "A global shortcut needs a modifier key.",
        )
        .into());
    }
    let mut bindings = state.bindings.lock().expect("快捷键锁损坏");
    let (old, other, sql) = match target {
        Target::Quick => (
            &bindings.quick,
            &bindings.main,
            "UPDATE standby SET hotkey=?1 WHERE slot=1",
        ),
        Target::Main => (
            &bindings.main,
            &bindings.quick,
            "UPDATE main_shortcut SET hotkey=?1 WHERE slot=1",
        ),
    };
    if other.key.parse::<Shortcut>().is_ok_and(|k| k == next) {
        return Err(tr(
            "主窗口与速记窗不能使用相同的快捷键。",
            "Use different shortcuts for the main window and quick capture.",
        )
        .into());
    }
    if old.key == key && old.issue.is_none() {
        return Ok(old.clone());
    }
    let manager = app.global_shortcut();
    register(&app, target, next).map_err(|e| {
        format!(
            "{key}: {} {e}",
            tr(
                "无法注册，请换一组按键：",
                "Could not register this shortcut. Choose another:"
            )
        )
    })?;
    let db = library.db.lock().expect("稿本锁损坏");
    if let Err(e) = db.execute(sql, [&key]) {
        manager.unregister(next).map_err(|rollback| {
            format!(
                "{e}; {} {rollback}",
                tr("撤回新快捷键失败：", "Could not roll back shortcut:")
            )
        })?;
        return Err(e.to_string());
    }
    if old.issue.is_none() {
        manager
            .unregister(old.key.as_str())
            .map_err(|e| e.to_string())?;
    }
    let updated = Binding { key, issue: None };
    match target {
        Target::Quick => bindings.quick = updated.clone(),
        Target::Main => bindings.main = updated.clone(),
    };
    Ok(updated)
}

pub fn signal(app: &AppHandle, action: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let result = w
            .unminimize()
            .and_then(|()| w.show())
            .and_then(|()| w.set_focus())
            .and_then(|()| w.emit("standby-action", action));
        if let Err(e) = result {
            rfd::MessageDialog::new()
                .set_title(tr("泉涌", "QuanY"))
                .set_description(e.to_string())
                .show();
        }
    }
}

struct TrayItems {
    quick: MenuItem<tauri::Wry>,
    full: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

#[tauri::command]
pub async fn set_language(app: AppHandle, english: bool) -> std::result::Result<(), String> {
    crate::language::set(english);
    let items = app.state::<TrayItems>();
    (|| -> tauri::Result<()> {
        items.quick.set_text(tr("右下角速记", "Quick capture"))?;
        items.full.set_text(tr("打开主窗口", "Open main window"))?;
        items.quit.set_text(tr("保存并退出", "Save and quit"))?;
        app.tray_by_id("quany")
            .expect("tray installed")
            .set_tooltip(Some(tr(
                "泉涌 · 单击速记，右击菜单",
                "QuanY · Click to capture, right-click for menu",
            )))?;
        let compact = app.state::<Standby>();
        let full = compact.full.lock().expect("window state poisoned");
        for (label, window) in app.webview_windows() {
            let title = if label.starts_with("memo-") {
                tr("泉涌 · 独立便笺", "QuanY · Sticky note")
            } else if full.is_some() {
                tr("泉涌 · 速记", "QuanY · Quick capture")
            } else {
                tr("泉涌", "QuanY")
            };
            window.set_title(title)?;
        }
        Ok(())
    })()
    .map_err(|e| e.to_string())
}

pub fn install(app: &tauri::App) -> Result<()> {
    upgrade_startup_command()?;
    let library = app.state::<Library>();
    let db = library.db.lock().expect("稿本锁损坏");
    db.execute_batch("CREATE TABLE IF NOT EXISTS standby(slot INTEGER PRIMARY KEY CHECK(slot=1),hotkey TEXT NOT NULL);
                    INSERT OR IGNORE INTO standby VALUES(1,'Ctrl+Alt+J');")?;
    let key: String = db.query_row("SELECT hotkey FROM standby WHERE slot=1", [], |r| r.get(0))?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS main_shortcut(slot INTEGER PRIMARY KEY CHECK(slot=1),hotkey TEXT NOT NULL);
        INSERT OR IGNORE INTO main_shortcut VALUES(1,'Ctrl+Alt+M');")?;
    let main_key: String =
        db.query_row("SELECT hotkey FROM main_shortcut WHERE slot=1", [], |r| {
            r.get(0)
        })?;
    drop(db);
    let install_key = |key: String, target| -> Result<Binding> {
        let issue = register(app.handle(), target, key.parse()?)
            .err()
            .map(|e| format!("{key}: {e}"));
        Ok(Binding { key, issue })
    };
    app.manage(Standby {
        full: Mutex::new(None),
        bindings: Mutex::new(Bindings {
            quick: install_key(key, Target::Quick)?,
            main: install_key(main_key, Target::Main)?,
        }),
    });
    let quick = MenuItem::with_id(app, "quick", "右下角速记", true, None::<&str>)?;
    let full = MenuItem::with_id(app, "full", "打开主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "保存并退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quick, &full, &quit])?;
    app.manage(TrayItems { quick, full, quit });
    TrayIconBuilder::with_id("quany")
        .icon(app.default_window_icon().ok_or("缺少泉涌图标")?.clone())
        .tooltip("泉涌 · 单击速记，右击菜单")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| signal(app, e.id.as_ref()))
        .on_tray_icon_event(|tray, e| {
            if matches!(
                e,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                signal(tray.app_handle(), "quick");
            }
        })
        .build(app)?;
    Ok(())
}

/// 使用鼠标所在屏幕的可用工作区，避开任务栏并保留主窗口几何状态。
#[tauri::command]
pub async fn display_editor(
    window: tauri::WebviewWindow,
    state: State<'_, Standby>,
    compact: bool,
) -> std::result::Result<(), String> {
    (|| -> Result<()> {
        let mut full = state.full.lock().expect("窗口状态锁损坏");
        window.unminimize()?;
        if compact {
            let cursor = window.cursor_position()?;
            let monitor = window
                .monitor_from_point(cursor.x, cursor.y)?
                .or(window.current_monitor()?)
                .ok_or(tr(
                    "无法取得显示器工作区",
                    "Could not read the monitor work area",
                ))?;
            if full.is_none() {
                let maximized = window.is_maximized()?;
                if maximized {
                    window.unmaximize()?;
                }
                *full = Some(Geometry {
                    at: window.outer_position()?,
                    size: window.inner_size()?,
                    maximized,
                });
            }
            let area = monitor.work_area();
            let scale = monitor.scale_factor();
            let pad = (12.0 * scale) as i32;
            let width =
                ((416.0 * scale) as u32).min(area.size.width.saturating_sub(2 * pad as u32));
            let height =
                ((300.0 * scale) as u32).min(area.size.height.saturating_sub(2 * pad as u32));
            window.set_min_size(Some(LogicalSize::new(280, 180)))?;
            window.set_size(PhysicalSize::new(width, height))?;
            let outer = window.outer_size()?;
            window.set_position(PhysicalPosition::new(
                area.position.x + (area.size.width as i32 - outer.width as i32 - pad).max(0),
                area.position.y + (area.size.height as i32 - outer.height as i32 - pad).max(0),
            ))?;
            window.set_always_on_top(true)?;
            window.set_title(tr("泉涌 · 速记", "QuanY · Quick capture"))?;
        } else if let Some(g) = full.as_ref() {
            if window.is_maximized()? {
                window.unmaximize()?;
            }
            window.set_always_on_top(false)?;
            window.set_min_size(Some(LogicalSize::new(540, 420)))?;
            window.set_size(g.size)?;
            window.set_position(g.at)?;
            if g.maximized {
                window.maximize()?;
            }
            window.set_title(tr("泉涌", "QuanY"))?;
            *full = None;
        }
        window.show()?;
        window.set_focus()?;
        Ok(())
    })()
    .map_err(|e| e.to_string())
}
