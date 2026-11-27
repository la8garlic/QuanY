//! 桌面命令是界面访问稿本的唯一入口；文件导出只写用户通过系统对话框选定的位置。

use crate::storage::{self, Desk, Entry, Library, Note, Place};
use rusqlite::Connection;
use std::{io::Write, path::Path};
use tauri::{State, Window};

fn query<T>(
    state: &Library,
    action: impl FnOnce(&mut Connection) -> rusqlite::Result<T>,
) -> Result<T, String> {
    let mut db = state.db.lock().expect("稿本数据库锁已损坏");
    action(&mut db).map_err(|e| format!("读写本地稿本失败：{e}"))
}

/// 恢复上次打开的稿件和侧栏目录。
#[tauri::command]
pub async fn start(state: State<'_, Library>) -> Result<Desk, String> {
    query(&state, |db| storage::desk(db))
}

/// 记录当前稿件，以便下次启动时恢复。
#[tauri::command]
pub async fn select_note(id: i64, state: State<'_, Library>) -> Result<Note, String> {
    query(&state, |db| storage::select(db, id))
}

/// 空白新稿与导入的文本都在创建时立即持久化。
#[tauri::command]
pub async fn create_note(
    title: String,
    body: String,
    state: State<'_, Library>,
) -> Result<Desk, String> {
    query(&state, |db| storage::create(db, &title, &body))
}

/// 返回已提交的修改时间，界面以此确认保存完成。
#[tauri::command]
pub async fn save_note(
    id: i64,
    title: String,
    body: String,
    place: Place,
    state: State<'_, Library>,
) -> Result<Entry, String> {
    query(&state, |db| storage::save(db, id, &title, &body, &place))
}

/// 只移动光标或滚动页面时，单独记下阅读位置，保留稿件的修改时间。
#[tauri::command]
pub async fn bookmark(id: i64, place: Place, state: State<'_, Library>) -> Result<(), String> {
    query(&state, |db| storage::bookmark(db, id, &place))
}

/// 删除用户确认的稿件，并返回删除后的工作区。
#[tauri::command]
pub async fn delete_note(id: i64, state: State<'_, Library>) -> Result<Desk, String> {
    query(&state, |db| storage::delete(db, id))
}

/// 同目录写完并同步临时文件后再替换目标，写入失败时保留原文件。
#[tauri::command]
pub async fn export_text(window: Window, title: String, body: String) -> Result<bool, String> {
    let filename: String = title
        .chars()
        .take(80)
        .map(|c| {
            if c.is_control() || r#"<>:"/\|?*"#.contains(c) {
                '＿'
            } else {
                c
            }
        })
        .collect();
    let name = filename.trim();
    let name = if name.is_empty() {
        "未命名手稿"
    } else {
        name
    };
    let target = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title("导出正文")
        .add_filter("UTF-8 文本", &["txt"])
        .set_file_name(format!("{name}.txt"))
        .save_file()
        .await;
    let Some(target) = target else {
        return Ok(false);
    };
    write_export(target.path(), body.as_bytes()).map_err(|e| format!("无法导出正文：{e}"))?;
    Ok(true)
}

fn write_export(path: &Path, body: &[u8]) -> std::io::Result<()> {
    let mut file = tempfile::NamedTempFile::new_in(path.parent().expect("文件对话框返回绝对路径"))?;
    file.write_all(body)?;
    file.as_file().sync_all()?;
    file.persist(path)?;
    Ok(())
}
