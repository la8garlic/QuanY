//! 自动快照在原稿改写事务中完成；同一篇的连续输入每十分钟保留一次旧稿。
use crate::{commands::query, storage::Library};
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

pub fn checkpoint(db: &Connection, id: i64, force: bool) -> rusqlite::Result<()> {
    let inserted=db.execute("INSERT INTO revisions(note,title,body,written)
        SELECT id,title,body,modified FROM notes WHERE id=?1 AND (title<>'' OR body<>'')
        AND (?2 OR NOT EXISTS(SELECT 1 FROM revisions WHERE note=?1 AND created>unixepoch()-600))
        AND NOT EXISTS(SELECT 1 FROM revisions r WHERE r.seq=(SELECT max(seq) FROM revisions WHERE note=?1)
                       AND r.title=notes.title AND r.body=notes.body)",params![id,force])?;
    if inserted > 0 {
        db.execute(
            "DELETE FROM revisions WHERE note=?1 AND seq NOT IN
        (SELECT seq FROM revisions WHERE note=?1 ORDER BY seq DESC LIMIT 40)",
            [id],
        )?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Written {
    title: String,
    body: String,
}
#[derive(Serialize)]
pub struct Revision {
    seq: i64,
    written: i64,
    title: String,
}
#[derive(Serialize)]
pub struct Hit {
    id: i64,
    title: String,
    modified: i64,
    snippet: String,
}

/// 参数化子串匹配保留百分号等普通字符；预览只返回命中附近的正文。
#[tauri::command]
pub async fn search_notes(term: String, state: State<'_, Library>) -> Result<Vec<Hit>, String> {
    query(&state, |db| {
        let mut stmt=db.prepare("WITH hits AS (SELECT id,label,modified,body,instr(lower(body),lower(?1)) AS pos
        FROM notes WHERE instr(lower(title),lower(?1))>0 OR instr(lower(body),lower(?1))>0)
        SELECT id,label,modified,substr(body,max(1,pos-12),80) FROM hits ORDER BY modified DESC,id DESC")?;
        let rows = stmt.query_map([term], |r| {
            Ok(Hit {
                id: r.get(0)?,
                title: r.get(1)?,
                modified: r.get(2)?,
                snippet: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    })
}

/// 只读参考稿，不改变下次启动时的当前稿件。
#[tauri::command]
pub async fn reference_note(id: i64, state: State<'_, Library>) -> Result<Written, String> {
    query(&state, |db| {
        Ok(
            db.query_row("SELECT title,body FROM notes WHERE id=?1", [id], |r| {
                Ok(Written {
                    title: r.get(0)?,
                    body: r.get(1)?,
                })
            })?,
        )
    })
}

/// 获取历史目录，正文仅在用户选中版本时加载。
#[tauri::command]
pub async fn revisions(id: i64, state: State<'_, Library>) -> Result<Vec<Revision>, String> {
    query(&state, |db| {
        let mut stmt =
            db.prepare("SELECT seq,written,title FROM revisions WHERE note=?1 ORDER BY seq DESC")?;
        let rows = stmt.query_map([id], |r| {
            Ok(Revision {
                seq: r.get(0)?,
                written: r.get(1)?,
                title: r.get(2)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    })
}

/// 校验版本归属，避免切换文稿后误取其他篇的正文。
#[tauri::command]
pub async fn revision_text(
    id: i64,
    seq: i64,
    state: State<'_, Library>,
) -> Result<Written, String> {
    query(&state, |db| {
        Ok(db.query_row(
            "SELECT title,body FROM revisions WHERE note=?1 AND seq=?2",
            params![id, seq],
            |r| {
                Ok(Written {
                    title: r.get(0)?,
                    body: r.get(1)?,
                })
            },
        )?)
    })
}

/// 手动留版和恢复前的存档共用这一事务。
#[tauri::command]
pub async fn mark_version(id: i64, state: State<'_, Library>) -> Result<(), String> {
    query(&state, |db| {
        let tx = db.transaction()?;
        checkpoint(&tx, id, true)?;
        tx.commit()?;
        Ok(())
    })
}
