//! 文件对话框授权具体路径；恢复稿先提交，文件错误与成功应答分别交给界面。
use crate::language::tr;
use crate::{
    files,
    storage::{self, Desk, Entry, Library, Note, Place},
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{State, Window};

pub(crate) fn query<T>(
    state: &Library,
    action: impl FnOnce(&mut Connection) -> files::Result<T>,
) -> Result<T, String> {
    let mut db = state.db.lock().expect("稿本数据库锁已损坏");
    action(&mut db).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct Snapshot {
    id: i64,
    title: String,
    body: String,
    place: Place,
}

#[derive(Serialize)]
pub struct Saved {
    entry: Entry,
    path: String,
}

fn write(db: &mut Connection, n: &Snapshot, target: Option<&Path>) -> files::Result<Saved> {
    let entry = storage::save(db, n.id, &n.title, &n.body, &n.place)?;
    let name = if n.title.trim().is_empty() {
        n.body.trim_start().lines().next().unwrap_or("")
    } else {
        &n.title
    };
    let path = files::publish(db, n.id, name, &n.body, target).map_err(|e| {
        format!(
            "{} {e}",
            tr(
                "恢复稿已保存，TXT 尚未写入：",
                "Recovery copy saved. Could not write the TXT file:"
            )
        )
    })?;
    Ok(Saved { entry, path })
}

/// 恢复上次使用的稿件、目录和保存设置。
#[tauri::command]
pub async fn start(state: State<'_, Library>) -> Result<Desk, String> {
    query(&state, |db| {
        let id = db.query_row("SELECT note FROM desk WHERE slot=1", [], |r| r.get(0))?;
        let notice = files::refresh(db, id)?;
        let mut desk = storage::desk(db)?;
        desk.note.notice = notice;
        Ok(desk)
    })
}

/// 整理属性独立于正文修改时间，置顶或改标签不会打乱最近编辑顺序。
#[tauri::command]
pub async fn set_details(
    id: i64,
    details: storage::Details,
    state: State<'_, Library>,
) -> Result<Entry, String> {
    query(&state, |db| storage::set_details(db, id, details))
}

/// 从本地稿本恢复当前文章与阅读位置。
#[tauri::command]
pub async fn select_note(id: i64, state: State<'_, Library>) -> Result<Note, String> {
    query(&state, |db| {
        let notice = files::refresh(db, id)?;
        let mut note = storage::select(db, id)?;
        note.notice = notice;
        Ok(note)
    })
}

/// 空白稿件在第一次写入时才占用一个 TXT 文件名。
#[tauri::command]
pub async fn create_note(
    title: String,
    body: String,
    state: State<'_, Library>,
) -> Result<Desk, String> {
    query(&state, |db| Ok(storage::create(db, &title, &body)?))
}

/// 保存到已关联的文件，或在默认目录中为新稿创建文件。
#[tauri::command]
pub async fn save_note(note: Snapshot, state: State<'_, Library>) -> Result<Saved, String> {
    query(&state, |db| write(db, &note, None))
}

/// 阅读位置独立写入，避免改变稿件修改时间。
#[tauri::command]
pub async fn bookmark(id: i64, place: Place, state: State<'_, Library>) -> Result<(), String> {
    query(&state, |db| Ok(storage::bookmark(db, id, &place)?))
}

/// 移除稿本记录，已保存的 TXT 仍归用户管理。
#[tauri::command]
pub async fn delete_note(id: i64, state: State<'_, Library>) -> Result<Desk, String> {
    query(&state, |db| Ok(storage::delete(db, id)?))
}

/// 由系统选择现有 TXT，并将当前稿件与原文件关联。
#[tauri::command]
pub async fn open_text(window: Window, state: State<'_, Library>) -> Result<Option<Desk>, String> {
    let folder = query(&state, |db| Ok(files::folder(db)?))?;
    let file = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_directory(folder)
        .set_title(tr("打开文本文件", "Open text file"))
        .add_filter(tr("纯文本", "Plain text"), &["txt"])
        .pick_file()
        .await;
    match file {
        Some(file) => query(&state, |db| files::open(db, file.path()).map(Some)),
        None => Ok(None),
    }
}

/// 另存成功后，把后续自动保存切换到新文件。
#[tauri::command]
pub async fn save_as(
    window: Window,
    note: Snapshot,
    dirty: bool,
    state: State<'_, Library>,
) -> Result<Option<Saved>, String> {
    let folder = query(&state, |db| {
        // 文件选择器可能一直打开，先保住尚未进入自动保存周期的末次输入。
        if dirty {
            storage::save(db, note.id, &note.title, &note.body, &note.place)?;
        }
        Ok(files::folder(db)?)
    })?;
    let name = if note.title.trim().is_empty() {
        note.body.trim_start().lines().next().unwrap_or("")
    } else {
        &note.title
    };
    let file = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_directory(folder)
        .set_file_name(files::filename(name))
        .set_title(tr("另存为", "Save as"))
        .add_filter(tr("纯文本", "Plain text"), &["txt"])
        .save_file()
        .await;
    match file {
        Some(file) => query(&state, |db| write(db, &note, Some(file.path())).map(Some)),
        None => Ok(None),
    }
}

/// 打开系统目录选择器，取消时保留原设置。
#[tauri::command]
pub async fn choose_folder(
    window: Window,
    state: State<'_, Library>,
) -> Result<Option<String>, String> {
    let folder = query(&state, |db| Ok(files::folder(db)?))?;
    let file = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_directory(folder)
        .set_title(tr("选择默认保存目录", "Choose the default save folder"))
        .pick_folder()
        .await;
    match file {
        Some(dir) => query(&state, |db| files::change_folder(db, dir.path()).map(Some)),
        None => Ok(None),
    }
}

/// 也允许直接粘贴目录，便于使用网络盘和较深的项目目录。
#[tauri::command]
pub async fn set_folder(path: String, state: State<'_, Library>) -> Result<String, String> {
    query(&state, |db| files::change_folder(db, Path::new(&path)))
}

/// 点击状态栏路径即可在资源管理器中查看当前 TXT 所在目录。
#[tauri::command]
pub async fn open_location(id: i64, state: State<'_, Library>) -> Result<(), String> {
    use rusqlite::OptionalExtension;
    query(&state, |db| {
        let file: Option<String> = db
            .query_row("SELECT path FROM links WHERE note=?1", [id], |r| r.get(0))
            .optional()?;
        let dir = match file {
            Some(path) => Path::new(&path)
                .parent()
                .ok_or(tr("文件缺少上级目录", "The file has no parent folder"))?
                .to_owned(),
            None => {
                let dir = std::path::PathBuf::from(files::folder(db)?);
                std::fs::create_dir_all(&dir)?;
                dir
            }
        };
        if !dir.is_dir() {
            return Err(tr(
                "此目录已移动或当前不可访问。",
                "The folder has moved or is unavailable.",
            )
            .into());
        }
        std::process::Command::new("explorer.exe")
            .arg(dir)
            .spawn()?;
        Ok(())
    })
}
