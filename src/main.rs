#![windows_subsystem = "windows"]

mod commands;
mod files;
mod storage;
mod text;

use std::{env, error::Error, path::PathBuf};
use tauri::Manager;

fn workspace(app: &tauri::App) -> Result<(PathBuf, PathBuf), Box<dyn Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
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
    let result = tauri::Builder::default()
        .setup(|app| {
            let library =
                workspace(app).and_then(|(dir, texts)| storage::Library::open(&dir, &texts));
            match library {
                Ok(library) => {
                    app.manage(library);
                }
                Err(error) => startup_error(error.as_ref()),
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
            commands::open_location
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
