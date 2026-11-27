//! Save shell requests until the editor is ready and has flushed its current draft.
use crate::{
    commands::query,
    files,
    language::tr,
    storage::{Desk, Library},
};
use std::{
    collections::VecDeque,
    ffi::OsString,
    io,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::State;

#[derive(Default)]
pub struct Launch {
    pub workspace: Option<PathBuf>,
    pub background: bool,
    pub files: VecDeque<PathBuf>,
}

impl Launch {
    pub fn parse(args: impl Iterator<Item = OsString>, cwd: &Path) -> io::Result<Self> {
        let mut command = Self::default();
        let mut args = args;
        while let Some(arg) = args.next() {
            match arg.to_str() {
                Some("--workspace") if command.workspace.is_none() => {
                    let path = args.next().ok_or_else(|| {
                        io::Error::new(io::ErrorKind::InvalidInput, "--workspace DIRECTORY")
                    })?;
                    command.workspace = Some(std::path::absolute(cwd.join(path))?);
                }
                Some("--background") => command.background = true,
                _ => {
                    let path = cwd.join(arg);
                    if !path
                        .extension()
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("txt"))
                    {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidInput,
                            format!("Expected .txt / 请选择 TXT: {}", path.display()),
                        ));
                    }
                    command.files.push_back(std::path::absolute(path)?);
                }
            }
        }
        Ok(command)
    }
}

pub struct OpenQueue(pub Mutex<VecDeque<PathBuf>>);

#[tauri::command]
pub fn has_shell_files(queue: State<'_, OpenQueue>) -> bool {
    !queue.0.lock().expect("open queue poisoned").is_empty()
}

#[tauri::command]
pub async fn open_next_txt(
    queue: State<'_, OpenQueue>,
    state: State<'_, Library>,
) -> Result<Option<Desk>, String> {
    let file = queue.0.lock().expect("open queue poisoned").pop_front();
    file.map(|path| {
        query(&state, |db| files::open(db, &path)).map_err(|e| {
            format!(
                "{} {}: {e}",
                tr("无法打开", "Could not open"),
                path.display()
            )
        })
    })
    .transpose()
}
