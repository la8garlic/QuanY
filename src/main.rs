#![windows_subsystem = "windows"]

mod commands;
mod storage;

use std::{env, error::Error, path::PathBuf};
use tauri::Manager;

fn workspace(app: &tauri::App) -> Result<PathBuf, Box<dyn Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    match args.as_slice() {
        [] => Ok(app.path().app_local_data_dir()?),
        [flag, path] if flag == "--workspace" => Ok(PathBuf::from(path)),
        _ => Err("用法：jianji.exe [--workspace 稿件目录]".into()),
    }
}

fn main() {
    let result = tauri::Builder::default()
        .setup(|app| {
            let library = workspace(app).and_then(|dir| storage::Library::open(&dir));
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
            commands::export_text
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
