#![windows_subsystem = "windows"]

mod archive;
mod association;
mod commands;
mod files;
mod language;
mod launch;
mod memos;
mod standby;
mod storage;
mod text;

use launch::{Launch, OpenQueue};
use std::{env, error::Error, path::Path, sync::Mutex};
use tauri::Manager;

fn open_library(
    app: &tauri::App,
    workspace: Option<&Path>,
) -> Result<storage::Library, Box<dyn Error>> {
    if let Some(dir) = workspace {
        return storage::Library::open(dir, &dir.join("文本"));
    }
    let documents = app.path().document_dir()?;
    let mut library =
        storage::Library::open(&app.path().app_local_data_dir()?, &documents.join("泉涌"))?;
    files::upgrade_default_folder(library.db.get_mut().expect("稿本锁损坏"), &documents)?;
    Ok(library)
}

fn main() {
    let launch = env::current_dir()
        .and_then(|cwd| Launch::parse(env::args_os().skip(1), &cwd))
        .unwrap_or_else(|e| startup_error(&e));
    let visible = !launch.background || !launch.files.is_empty();
    let mut builder = tauri::Builder::default()
        // 所有编辑窗口在页面加载时统一关闭 WebView2 的浏览器右键菜单。
        .append_invoke_initialization_script(
            "\n;window.addEventListener('contextmenu', event => event.preventDefault(), true);",
        )
        .manage(OpenQueue(Mutex::new(launch.files)));
    if launch.workspace.is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            // The sender already validated the arguments. Resolve relative paths against its cwd.
            match Launch::parse(args.into_iter().skip(1).map(Into::into), Path::new(&cwd)) {
                Ok(request) if !request.files.is_empty() => {
                    app.state::<OpenQueue>()
                        .0
                        .lock()
                        .expect("open queue poisoned")
                        .extend(request.files);
                    standby::signal(app, "open-files");
                }
                Ok(request) if !request.background => standby::signal(app, "full"),
                Ok(_) => {}
                Err(error) => {
                    rfd::MessageDialog::new()
                        .set_title("QuanY")
                        .set_description(error.to_string())
                        .show();
                }
            }
        }));
    }
    let result = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(move |app| {
            match open_library(app, launch.workspace.as_deref()) {
                Ok(library) => {
                    app.manage(library);
                }
                Err(error) => startup_error(error.as_ref()),
            }
            app.manage(memos::MemoWindows::default());
            if let Err(e) = standby::install(app) {
                startup_error(e.as_ref());
            }
            if visible {
                app.get_webview_window("main")
                    .expect("主窗口已配置")
                    .show()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            association::register_txt_handler,
            association::open_default_apps,
            launch::has_shell_files,
            launch::open_next_txt,
            archive::search_notes,
            archive::reference_note,
            archive::revisions,
            archive::revision_text,
            archive::mark_version,
            memos::memo_list,
            memos::open_memo,
            memos::memo_read,
            memos::memo_write,
            memos::memo_delete,
            memos::exit_editor,
            commands::start,
            commands::set_details,
            commands::select_note,
            commands::create_note,
            commands::save_note,
            commands::bookmark,
            commands::delete_note,
            commands::save_as,
            commands::open_text,
            commands::choose_folder,
            commands::set_folder,
            commands::open_location,
            standby::standby_settings,
            standby::set_language,
            standby::set_autostart,
            standby::bind_summon,
            standby::display_editor
        ])
        .build(tauri::generate_context!());
    match result {
        Ok(app) => app.run(|_, _| {}),
        Err(error) => startup_error(&error),
    }
}

fn startup_error(error: &dyn Error) -> ! {
    rfd::MessageDialog::new()
        .set_title("QuanY could not start · 泉涌无法启动")
        .set_description(error.to_string())
        .set_level(rfd::MessageLevel::Error)
        .show();
    std::process::exit(1);
}
