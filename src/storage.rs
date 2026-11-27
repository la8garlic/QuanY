//! SQLite 只接收完整稿件快照，正文、标题和修改时间在同一次提交中落盘。

use crate::language::tr;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::{
    error::Error,
    fs::{self, File},
    path::Path,
    sync::{Arc, Mutex},
};

pub struct Library {
    pub db: Mutex<Connection>,
    files: Arc<Mutex<Connection>>,
    // 锁随进程释放，异常退出后无需清理标记文件。
    _writer: File,
}

#[derive(Serialize)]
pub struct Entry {
    #[serde(flatten)]
    details: Details,
    id: i64,
    title: String,
    modified: i64,
}

/// 标签、置顶和目标随稿本保存，写出纯文本时只取正文。
#[derive(Serialize, Deserialize)]
pub struct Details {
    pinned: bool,
    tags: Vec<String>,
    goal: u32,
}

#[derive(Serialize)]
pub struct Note {
    pub id: i64,
    title: String,
    body: String,
    modified: i64,
    place: Place,
    path: Option<String>,
    pending: bool,
    pub notice: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Place {
    start: u32,
    end: u32,
    top: f64,
}

#[derive(Serialize)]
pub struct Desk {
    entries: Vec<Entry>,
    pub note: Note,
    folder: String,
}

impl Library {
    /// TXT 读写串行；等待外部卷不占用便笺与检索的连接或异步执行线程。
    pub async fn with_files<T: Send + 'static>(
        &self,
        action: impl FnOnce(&mut Connection) -> crate::files::Result<T> + Send + 'static,
    ) -> Result<T, String> {
        let files = Arc::clone(&self.files);
        tauri::async_runtime::spawn_blocking(move || {
            let mut db = files.lock().expect("文件操作锁损坏");
            action(&mut db).map_err(|e| e.to_string())
        })
        .await
        .expect("文件操作线程异常退出")
    }

    pub fn open(dir: &Path, texts: &Path) -> Result<Self, Box<dyn Error>> {
        fs::create_dir_all(dir)?;
        let writer = File::options()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.join("writer.lock"))?;
        match writer.try_lock() {
            Ok(()) => {}
            Err(std::fs::TryLockError::WouldBlock) => {
                return Err(
                    "This library is already open in QuanY. / 这个稿本已经在另一个泉涌窗口中打开。"
                        .into(),
                )
            }
            Err(std::fs::TryLockError::Error(err)) => return Err(err.into()),
        }
        let open_connection = || -> rusqlite::Result<Connection> {
            let mut db = Connection::open(dir.join("notes.sqlite3"))?;
            db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;")?;
            // 写事务先取得写入权，避免两条连接同时从读事务升级。
            db.set_transaction_behavior(rusqlite::TransactionBehavior::Immediate);
            Ok(db)
        };
        let mut db = open_connection()?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                 id INTEGER PRIMARY KEY, title TEXT NOT NULL, label TEXT NOT NULL, body TEXT NOT NULL,
                 modified INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
             );
             CREATE TABLE IF NOT EXISTS draft_pieces (
                 note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, part INTEGER NOT NULL,
                 start_byte INTEGER NOT NULL, keep_bytes INTEGER NOT NULL, addition TEXT NOT NULL,
                 PRIMARY KEY(note,part)
             ) WITHOUT ROWID;
             CREATE TABLE IF NOT EXISTS stage_receipts (
                 note INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, token TEXT NOT NULL
             );
             CREATE TRIGGER IF NOT EXISTS clear_draft_pieces AFTER UPDATE OF body ON notes
             BEGIN DELETE FROM draft_pieces WHERE note=NEW.id; END;
             CREATE VIEW IF NOT EXISTS manuscript_text AS SELECT id,title,label,modified,
                 CASE WHEN EXISTS(SELECT 1 FROM draft_pieces WHERE note=n.id)
                 THEN (SELECT group_concat(CAST(substr(CAST(n.body AS BLOB),start_byte+1,keep_bytes) AS TEXT)||addition,'' ORDER BY part)
                       FROM draft_pieces WHERE note=n.id)
                 ELSE body END AS body FROM notes AS n;
             CREATE TABLE IF NOT EXISTS details (
                 note INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
                 pinned INTEGER NOT NULL, tags TEXT NOT NULL, goal INTEGER NOT NULL CHECK(goal>=0)
             );
             CREATE VIEW IF NOT EXISTS catalog AS
                 SELECT id,label,modified,coalesce(pinned,0) AS pinned,coalesce(tags,'') AS tags,coalesce(goal,0) AS goal
                 FROM notes LEFT JOIN details ON details.note=notes.id;
             CREATE TABLE IF NOT EXISTS revisions(seq INTEGER PRIMARY KEY,note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                 title TEXT NOT NULL,body TEXT NOT NULL,written INTEGER NOT NULL,created INTEGER NOT NULL DEFAULT(unixepoch()));
             CREATE INDEX IF NOT EXISTS revision_note ON revisions(note,seq DESC);
             CREATE TABLE IF NOT EXISTS memos(id INTEGER PRIMARY KEY,body TEXT NOT NULL,modified INTEGER NOT NULL DEFAULT(unixepoch()));
             CREATE INDEX IF NOT EXISTS contents ON notes(modified DESC,id DESC,label);
             CREATE TABLE IF NOT EXISTS places (
                 note INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
                 start INTEGER NOT NULL, end INTEGER NOT NULL, top REAL NOT NULL
             );
             CREATE TABLE IF NOT EXISTS links (
                 note INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
                 path TEXT NOT NULL UNIQUE COLLATE NOCASE, baseline BLOB NOT NULL
             );
             CREATE TABLE IF NOT EXISTS outbox (note INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE);
             CREATE TABLE IF NOT EXISTS save_options (slot INTEGER PRIMARY KEY CHECK(slot=1), folder TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS desk (
                 slot INTEGER PRIMARY KEY CHECK(slot=1), note INTEGER NOT NULL REFERENCES notes(id)
             );",
        )?;
        let tx = db.transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO save_options VALUES(1,?1)",
            [texts.to_string_lossy().as_ref()],
        )?;
        if tx.query_row("SELECT count(*) FROM desk", [], |r| r.get::<_, i64>(0))? == 0 {
            let id = insert(&tx, "", "")?;
            tx.execute("INSERT INTO desk VALUES(1, ?1)", [id])?;
        }
        tx.commit()?;
        Ok(Self {
            db: Mutex::new(db),
            files: Arc::new(Mutex::new(open_connection()?)),
            _writer: writer,
        })
    }
}

fn read_note(db: &Connection, id: i64) -> rusqlite::Result<Note> {
    db.query_row("SELECT n.id,n.title,n.body,n.modified,coalesce(p.start,0),coalesce(p.end,0),coalesce(p.top,0),
                         l.path, EXISTS(SELECT 1 FROM outbox WHERE note=n.id)
                  FROM manuscript_text n LEFT JOIN places p ON p.note=n.id LEFT JOIN links l ON l.note=n.id WHERE n.id=?1", [id], |r| Ok(Note {
        id: r.get(0)?,
        title: r.get(1)?,
        body: r.get(2)?,
        modified: r.get(3)?,
        place: Place { start: r.get(4)?, end: r.get(5)?, top: r.get(6)? },
        path: r.get(7)?, pending: r.get(8)?, notice: None,
    }))
}

pub fn desk(db: &Connection) -> rusqlite::Result<Desk> {
    let id = db.query_row("SELECT note FROM desk WHERE slot=1", [], |r| r.get(0))?;
    let note = read_note(db, id)?;
    // 稿本列表只读索引信息，打开一本长稿不会把其他稿件的正文带入界面。
    let mut query = db.prepare(
        "SELECT id,label,modified,pinned,tags,goal FROM catalog ORDER BY modified DESC,id DESC",
    )?;
    let entries = query
        .query_map([], entry)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(Desk {
        entries,
        note,
        folder: crate::files::folder(db)?,
    })
}

pub fn read_entry(db: &Connection, id: i64) -> rusqlite::Result<Entry> {
    db.query_row(
        "SELECT id,label,modified,pinned,tags,goal FROM catalog WHERE id=?1",
        [id],
        entry,
    )
}

pub fn set_details(db: &mut Connection, id: i64, details: Details) -> crate::files::Result<Entry> {
    let mut tags = Vec::new();
    for tag in &details.tags {
        let tag = tag.trim();
        if tag.is_empty() {
            continue;
        }
        if tag.contains(['\r', '\n', ',', '，']) {
            return Err(tr(
                "标签名称中不能包含逗号或换行。",
                "Tags cannot contain commas or newlines.",
            )
            .into());
        }
        if !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    let tx = db.transaction()?;
    tx.execute("INSERT INTO details(note,pinned,tags,goal) VALUES(?1,?2,?3,?4)
                ON CONFLICT(note) DO UPDATE SET pinned=excluded.pinned,tags=excluded.tags,goal=excluded.goal",
        params![id,details.pinned,tags.join("\n"),details.goal])?;
    let result = read_entry(&tx, id)?;
    tx.commit()?;
    Ok(result)
}

fn entry(r: &Row<'_>) -> rusqlite::Result<Entry> {
    Ok(Entry {
        details: Details {
            pinned: r.get(3)?,
            tags: r.get::<_, String>(4)?.lines().map(str::to_owned).collect(),
            goal: r.get(5)?,
        },
        id: r.get(0)?,
        title: r.get(1)?,
        modified: r.get(2)?,
    })
}

fn label(title: &str, body: &str) -> String {
    let text = if title.trim().is_empty() {
        body.trim_start()
    } else {
        title.trim()
    };
    text.chars().take_while(|c| *c != '\n').take(80).collect()
}

pub fn reload_body(db: &Connection, id: i64, body: &str) -> rusqlite::Result<()> {
    let different: bool = db.query_row(
        "SELECT body<>?2 FROM manuscript_text WHERE id=?1",
        params![id, body],
        |r| r.get(0),
    )?;
    if !different {
        return Ok(());
    }
    crate::archive::checkpoint(db, id, false)?;
    let title: String = db.query_row("SELECT title FROM notes WHERE id=?1", [id], |r| r.get(0))?;
    db.execute(
        "UPDATE notes SET body=?2,label=?3,modified=CAST(unixepoch('subsec')*1000 AS INTEGER)
        WHERE id=?1",
        params![id, body, label(&title, body)],
    )?;
    Ok(())
}

pub fn insert(db: &Connection, title: &str, body: &str) -> rusqlite::Result<i64> {
    db.execute(
        "INSERT INTO notes(title,body,label) VALUES(?1,?2,?3)",
        params![title, body, label(title, body)],
    )?;
    Ok(db.last_insert_rowid())
}

pub fn select(db: &Connection, id: i64) -> rusqlite::Result<Note> {
    let note = read_note(db, id)?;
    db.execute("UPDATE desk SET note=?1 WHERE slot=1", [id])?;
    Ok(note)
}

pub fn create(db: &mut Connection, title: &str, body: &str) -> rusqlite::Result<Desk> {
    let tx = db.transaction()?;
    let id = insert(&tx, title, body)?;
    tx.execute("UPDATE desk SET note=?1 WHERE slot=1", [id])?;
    let result = desk(&tx)?;
    tx.commit()?;
    Ok(result)
}

pub fn bookmark(db: &Connection, id: i64, place: &Place) -> rusqlite::Result<()> {
    db.execute("INSERT INTO places(note,start,end,top) VALUES(?1,?2,?3,?4)
                ON CONFLICT(note) DO UPDATE SET start=excluded.start,end=excluded.end,top=excluded.top",
                params![id, place.start, place.end, place.top])?;
    Ok(())
}

/// 收据与改动在同一事务落盘，IPC 回执丢失时重发不会重复插字。
pub fn stage(db: &mut Connection, note: &crate::commands::DraftEdits) -> crate::files::Result<()> {
    let tx = db.transaction()?;
    let id = note.id;
    let repeated: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM stage_receipts WHERE note=?1 AND token=?2)",
        params![id, note.token],
        |r| r.get(0),
    )?;
    if repeated {
        return Ok(());
    }
    crate::archive::checkpoint(&tx, id, false)?;
    crate::chunks::apply(&tx, id, note.length, &note.edits)?;
    tx.execute("UPDATE notes SET title=?2,label=?3,modified=CAST(unixepoch('subsec')*1000 AS INTEGER) WHERE id=?1",
        params![id,note.title,note.label])?;
    bookmark(&tx, id, &note.place)?;
    tx.execute("INSERT OR IGNORE INTO outbox VALUES(?1)", [id])?;
    tx.execute("INSERT INTO stage_receipts(note,token) VALUES(?1,?2) ON CONFLICT(note) DO UPDATE SET token=excluded.token",params![id,note.token])?;
    tx.commit()?;
    Ok(())
}

pub fn delete(db: &mut Connection, id: i64) -> rusqlite::Result<Desk> {
    let tx = db.transaction()?;
    let next = tx
        .query_row(
            "SELECT id FROM notes WHERE id<>?1 ORDER BY modified DESC,id DESC LIMIT 1",
            [id],
            |r| r.get::<_, i64>(0),
        )
        .optional()?;
    let next = match next {
        Some(next) => next,
        None => insert(&tx, "", "")?,
    };
    // 切换到相邻稿件和删除必须一起成功，恢复窗口时始终有一篇有效稿件。
    tx.execute("UPDATE desk SET note=?1 WHERE slot=1", [next])?;
    tx.execute("DELETE FROM notes WHERE id=?1", [id])?;
    let result = desk(&tx)?;
    tx.commit()?;
    Ok(result)
}
