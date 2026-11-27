#![windows_subsystem = "windows"]

mod archive;
mod commands;
mod files;
mod language;
mod memos;
mod standby;
mod storage;
mod text;

use std::{env, error::Error};
use tauri::Manager;

fn open_library(app: &tauri::App) -> Result<storage::Library, Box<dyn Error>> {
    let args: Vec<_> = env::args_os()
        .skip(1)
        .filter(|arg| arg != "--background")
        .collect();
    match args.as_slice() {
        [] => {
            let documents = app.path().document_dir()?;
            let mut library =
                storage::Library::open(&app.path().app_local_data_dir()?, &documents.join("泉涌"))?;
            files::upgrade_default_folder(library.db.get_mut().expect("稿本锁损坏"), &documents)?;
            Ok(library)
        }
        [flag, path] if flag == "--workspace" => {
            let dir = std::path::absolute(path)?;
            storage::Library::open(&dir, &dir.join("文本"))
        }
        _ => Err("Usage / 用法: QuanY.exe [--workspace DIRECTORY]".into()),
    }
}

fn main() {
    let mut builder = tauri::Builder::default();
    if !env::args_os().any(|s| s == "--workspace") {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|s| s == "--background") {
                standby::signal(app, "full");
            }
        }));
    }
    let result = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            match open_library(app) {
                Ok(library) => {
                    app.manage(library);
                }
                Err(error) => startup_error(error.as_ref()),
            }
            app.manage(memos::MemoWindows::default());
            if let Err(e) = standby::install(app) {
                startup_error(e.as_ref());
            }
            if !env::args_os().any(|s| s == "--background") {
                app.get_webview_window("main")
                    .expect("主窗口已配置")
                    .show()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
