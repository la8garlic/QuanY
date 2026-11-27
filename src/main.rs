#![windows_subsystem = "windows"]

mod commands;
mod files;
mod standby;
mod storage;
mod text;

use std::{env, error::Error, path::PathBuf};
use tauri::Manager;

fn workspace(app: &tauri::App) -> Result<(PathBuf, PathBuf), Box<dyn Error>> {
    let args: Vec<_> = env::args_os()
        .skip(1)
        .filter(|arg| arg != "--background")
        .collect();
    match args.as_slice() {
        [] => Ok((
            app.path().app_local_data_dir()?,
            app.path().document_dir()?.join("笺记"),
        )),
        [flag, path] if flag == "--workspace" => {
            let dir = std::path::absolute(path)?;
            Ok((dir.clone(), dir.join("文本")))
        }
        _ => Err("用法：jianji.exe [--workspace 稿件目录]".into()),
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        standby::signal(app, "quick");
                    }
                })
                .build(),
        )
        .setup(|app| {
            let library =
                workspace(app).and_then(|(dir, texts)| storage::Library::open(&dir, &texts));
            match library {
                Ok(library) => {
                    app.manage(library);
                }
                Err(error) => startup_error(error.as_ref()),
            }
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
            commands::start,
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
        .set_title("笺记无法启动")
        .set_description(error.to_string())
        .set_level(rfd::MessageLevel::Error)
        .show();
    std::process::exit(1);
}
