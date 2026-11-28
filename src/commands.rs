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
pub struct DraftEdits {
    pub id: i64,
    pub title: String,
    pub label: String,
    pub place: Place,
    pub token: String,
    pub length: usize,
    pub edits: Vec<crate::chunks::Edit>,
}

#[derive(Serialize)]
pub struct Saved {
    entry: Entry,
    path: String,
}

fn publish(db: &mut Connection, id: i64, target: Option<&Path>) -> files::Result<Saved> {
    let (title, body): (String, String) = db.query_row(
        "SELECT title,body FROM manuscript_text WHERE id=?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let entry = storage::read_entry(db, id)?;
    let name = if title.trim().is_empty() {
        body.trim_start().lines().next().unwrap_or("")
    } else {
        &title
    };
    let path = match files::publish(db, id, name, &body, target) {
        Ok(path) => path,
        Err(error) => {
            // 原文件离线或冲突时仍保留完整恢复稿，待写标记留到重试成功。
            crate::chunks::consolidate(db, id, &body)?;
            return Err(format!(
                "{} {error}",
                tr(
                    "恢复稿已保存，TXT 尚未写入：",
                    "Recovery copy saved. Could not write the TXT file:"
                )
            )
            .into());
        }
    };
    Ok(Saved { entry, path })
}

/// 恢复上次使用的稿件、目录和保存设置。
#[tauri::command]
pub async fn start(state: State<'_, Library>) -> Result<Desk, String> {
    state
        .with_files(|db| {
            let id = db.query_row("SELECT note FROM desk WHERE slot=1", [], |r| r.get(0))?;
            let notice = files::refresh(db, id)?;
            let mut desk = storage::desk(db)?;
            desk.note.notice = notice;
            Ok(desk)
        })
        .await
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
    state
        .with_files(move |db| {
            let notice = files::refresh(db, id)?;
            let mut note = storage::select(db, id)?;
            note.notice = notice;
            Ok(note)
        })
        .await
}

/// 空白稿件在第一次写入时才占用一个 TXT 文件名。
#[tauri::command]
pub async fn create_note(
    title: String,
    body: String,
    state: State<'_, Library>,
) -> Result<Desk, String> {
    state
        .with_files(move |db| Ok(storage::create(db, &title, &body)?))
        .await
}

/// 保存到已关联的文件，或在默认目录中为新稿创建文件。
#[tauri::command]
pub async fn stage_note(note: DraftEdits, state: State<'_, Library>) -> Result<(), String> {
    state.with_files(move |db| storage::stage(db, &note)).await
}

#[tauri::command]
pub async fn publish_note(id: i64, state: State<'_, Library>) -> Result<Saved, String> {
    state.with_files(move |db| publish(db, id, None)).await
}

/// 阅读位置独立写入，避免改变稿件修改时间。
#[tauri::command]
pub async fn bookmark(id: i64, place: Place, state: State<'_, Library>) -> Result<(), String> {
    state
        .with_files(move |db| Ok(storage::bookmark(db, id, &place)?))
        .await
}

#[derive(Serialize)]
pub struct RemovalTarget {
    title: String,
    path: Option<String>,
}

fn removal_target(db: &Connection, id: i64) -> rusqlite::Result<RemovalTarget> {
    db.query_row(
        "SELECT label,path FROM visible_catalog LEFT JOIN links ON note=id WHERE id=?1",
        [id],
        |r| {
            Ok(RemovalTarget {
                title: r.get(0)?,
                path: r.get(1)?,
            })
        },
    )
}

#[tauri::command]
pub async fn note_removal_target(
    id: i64,
    state: State<'_, Library>,
) -> Result<RemovalTarget, String> {
    query(&state, |db| Ok(removal_target(db, id)?))
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Removal {
    Hide,
    Delete { path: Option<String> },
}

#[tauri::command]
pub async fn remove_note(
    id: i64,
    operation: Removal,
    state: State<'_, Library>,
) -> Result<Option<Desk>, String> {
    state.with_files(move |db| {
        if matches!(operation, Removal::Hide) {
            // 老稿本可能只有本地正文。先完成待写 TXT，移除后仍可从文件打开。
            let pending: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM outbox WHERE note=?1)
                OR (NOT EXISTS(SELECT 1 FROM links WHERE note=?1) AND EXISTS(
                    SELECT 1 FROM notes WHERE id=?1 AND (title<>'' OR body<>'')))", [id], |r| r.get(0))?;
            if pending { publish(db, id, None)?; }
        }
        let tx = db.transaction()?;
        let target = removal_target(&tx, id)?;
        let switched = storage::move_off_note(&tx, id)?;
        let disk_path = match operation {
            Removal::Hide => {
                tx.execute("INSERT INTO hidden_notes(note) VALUES(?1)", [id])?;
                None
            }
            Removal::Delete { path } => {
                if target.path != path {
                    return Err(tr("关联文件已改变，请重新确认。", "The linked file changed. Confirm again.").into());
                }
                if let Some(path) = &target.path {
                    let disk = std::fs::read(path)?;
                    let same: bool = tx.query_row("SELECT baseline=?1 FROM links WHERE note=?2",
                        rusqlite::params![disk, id], |r| r.get(0))?;
                    if !same { return Err(tr("原文件已被外部修改，请重新打开核对后再删除。",
                        "The file changed on disk. Reopen it and review the changes before deleting.").into()); }
                }
                tx.execute("DELETE FROM notes WHERE id=?1", [id])?;
                target.path
            }
        };
        let next = switched.then(|| storage::desk(&tx)).transpose()?;
        // 删除失败会回滚稿本事务；提交之前始终保留可恢复的本地正文。
        if let Some(path) = disk_path { std::fs::remove_file(path)?; }
        tx.commit()?;
        Ok(next)
    }).await
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
        Some(file) => {
            state
                .with_files(move |db| files::open(db, file.path()).map(Some))
                .await
        }
        None => Ok(None),
    }
}

/// 另存成功后，把后续自动保存切换到新文件。
#[tauri::command]
pub async fn save_as(
    window: Window,
    id: i64,
    state: State<'_, Library>,
) -> Result<Option<Saved>, String> {
    let (folder, name) = query(&state, |db| {
        let name: String =
            db.query_row("SELECT label FROM notes WHERE id=?1", [id], |r| r.get(0))?;
        Ok((files::folder(db)?, name))
    })?;
    let file = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_directory(folder)
        .set_file_name(files::filename(&name))
        .set_title(tr("另存为", "Save as"))
        .add_filter(tr("纯文本", "Plain text"), &["txt"])
        .save_file()
        .await;
    match file {
        Some(file) => {
            state
                .with_files(move |db| publish(db, id, Some(file.path())).map(Some))
                .await
        }
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
        Some(dir) => {
            state
                .with_files(move |db| files::change_folder(db, dir.path()).map(Some))
                .await
        }
        None => Ok(None),
    }
}

/// 也允许直接粘贴目录，便于使用网络盘和较深的项目目录。
#[tauri::command]
pub async fn set_folder(path: String, state: State<'_, Library>) -> Result<String, String> {
    state
        .with_files(move |db| files::change_folder(db, Path::new(&path)))
        .await
}

/// 点击状态栏路径即可在资源管理器中查看当前 TXT 所在目录。
#[tauri::command]
pub async fn open_location(id: i64, state: State<'_, Library>) -> Result<(), String> {
    use rusqlite::OptionalExtension;
    state
        .with_files(move |db| {
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
        .await
}
