//! 每张便笺独占一个窗口和一条记录。退出应用时，等待便笺完成保存并真正关闭。
use crate::{commands::query, storage::Library};
use serde::Serialize;
use std::{
    collections::HashSet,
    sync::{Condvar, Mutex},
    time::Duration,
};
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

#[derive(Default)]
pub struct MemoWindows {
    labels: Mutex<HashSet<String>>,
    closed: Condvar,
}
#[derive(Serialize)]
pub struct MemoItem {
    id: i64,
    preview: String,
}

#[tauri::command]
pub async fn memo_list(state: State<'_, Library>) -> Result<Vec<MemoItem>, String> {
    query(&state, |db| {
        let mut stmt =
            db.prepare("SELECT id,substr(body,1,60) FROM memos ORDER BY modified DESC,id DESC")?;
        let rows = stmt.query_map([], |r| {
            Ok(MemoItem {
                id: r.get(0)?,
                preview: r.get(1)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    })
}

/// 已打开的便笺直接获得焦点，同一条内容始终只有一个编辑器。
#[tauri::command]
pub async fn open_memo(
    app: AppHandle,
    state: State<'_, Library>,
    id: Option<i64>,
) -> Result<(), String> {
    let id = query(&state, |db| match id {
        Some(id) => Ok(db.query_row("SELECT id FROM memos WHERE id=?1", [id], |r| {
            r.get::<_, i64>(0)
        })?),
        None => {
            db.execute("INSERT INTO memos(body) VALUES('')", [])?;
            Ok(db.last_insert_rowid())
        }
    })?;
    let label = format!("memo-{id}");
    if let Some(w) = app.get_webview_window(&label) {
        return w
            .unminimize()
            .and_then(|()| w.set_focus())
            .map_err(|e| e.to_string());
    }
    let w = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("memo.html".into()))
        .title("笺记 · 独立便笺")
        .inner_size(320., 240.)
        .min_inner_size(240., 165.)
        .always_on_top(true)
        .build()
        .map_err(|e| e.to_string())?;
    app.state::<MemoWindows>()
        .labels
        .lock()
        .expect("便笺窗口锁损坏")
        .insert(label.clone());
    w.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let windows = app.state::<MemoWindows>();
            windows
                .labels
                .lock()
                .expect("便笺窗口锁损坏")
                .remove(&label);
            windows.closed.notify_all();
        }
    });
    Ok(())
}

fn memo_id(w: &WebviewWindow) -> Result<i64, String> {
    w.label()
        .strip_prefix("memo-")
        .ok_or("仅可从便笺窗口访问")?
        .parse()
        .map_err(|_| "无效的便笺编号".into())
}
#[tauri::command]
pub async fn memo_read(window: WebviewWindow, state: State<'_, Library>) -> Result<String, String> {
    let id = memo_id(&window)?;
    query(&state, |db| {
        Ok(db.query_row("SELECT body FROM memos WHERE id=?1", [id], |r| r.get(0))?)
    })
}
#[tauri::command]
pub async fn memo_write(
    window: WebviewWindow,
    state: State<'_, Library>,
    body: String,
) -> Result<(), String> {
    let id = memo_id(&window)?;
    query(&state, |db| {
        db.execute(
            "UPDATE memos SET body=?1,modified=unixepoch() WHERE id=?2",
            rusqlite::params![body, id],
        )?;
        Ok(())
    })
}

/// 删除请求绑定到发起操作的窗口，避免影响其他便笺。
#[tauri::command]
pub async fn memo_delete(window: WebviewWindow, state: State<'_, Library>) -> Result<(), String> {
    let id = memo_id(&window)?;
    query(&state, |db| {
        db.execute("DELETE FROM memos WHERE id=?1", [id])?;
        Ok(())
    })
}

/// 主稿已由调用方保存；每张便笺走各自的正常关闭流程。
#[tauri::command]
pub async fn exit_editor(app: AppHandle) -> Result<(), String> {
    for (label, w) in app.webview_windows() {
        if label.starts_with("memo-") {
            w.close().map_err(|e| e.to_string())?;
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let windows = app.state::<MemoWindows>();
        let labels = windows.labels.lock().expect("便笺窗口锁损坏");
        let (remaining, _) = windows
            .closed
            .wait_timeout_while(labels, Duration::from_secs(10), |s| !s.is_empty())
            .expect("便笺关闭锁损坏");
        if !remaining.is_empty() {
            return Err("便笺尚未保存关闭，请检查便笺窗口后再退出。".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
