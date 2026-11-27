//! 恢复稿按 UTF-8 块保存，编辑坐标沿用 WebView 的 UTF-16 码元。
use crate::files::Result;
use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Edit {
    from: usize,
    to: usize,
    insert: String,
}

fn byte_offset(text: &str, units: usize) -> Result<usize> {
    let mut at = 0;
    for (byte, ch) in text.char_indices() {
        if at == units {
            return Ok(byte);
        }
        at += ch.len_utf16();
        if at > units {
            break;
        }
    }
    if at == units {
        return Ok(text.len());
    }
    Err("Edit offset is outside the text or splits a surrogate pair".into())
}

/// 仅记录保留的原文区间和新增文本。完整原文一直保存在 notes.body 中。
pub fn apply(db: &Connection, id: i64, expected: usize, edits: &[Edit]) -> Result<()> {
    if edits.is_empty() {
        return Ok(());
    }
    // 在上一次导出前又收到新批次时，先在同一个事务中合并旧批次。
    db.execute(
        "UPDATE notes SET body=(SELECT body FROM manuscript_text WHERE id=?1)
        WHERE id=?1 AND EXISTS(SELECT 1 FROM draft_pieces WHERE note=?1)",
        [id],
    )?;
    let mut source = db.prepare("SELECT body FROM notes WHERE id=?1")?;
    let mut rows = source.query([id])?;
    let row = rows.next()?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    let base = row.get_ref(0)?.as_str()?;
    if base.encode_utf16().count() != expected {
        return Err("Draft length changed. Reopen the recovery copy.".into());
    }
    let mut add = db.prepare(
        "INSERT INTO draft_pieces(note,part,start_byte,keep_bytes,addition) VALUES(?1,?2,?3,?4,?5)",
    )?;
    let mut units = 0;
    let mut start = 0;
    for (i, edit) in edits.iter().enumerate() {
        if edit.from < units || edit.from > edit.to || edit.to > expected {
            return Err("Invalid edit range".into());
        }
        // 文末追加与整篇替换直接使用已知边界；其余端点只扫描一次。
        let from = if edit.from == expected {
            base.len()
        } else {
            start + byte_offset(&base[start..], edit.from - units)?
        };
        let to = if edit.to == expected {
            base.len()
        } else {
            from + byte_offset(&base[from..], edit.to - edit.from)?
        };
        add.execute(params![id, i, start, from - start, edit.insert])?;
        units = edit.to;
        start = to;
    }
    if start < base.len() {
        add.execute(params![id, edits.len(), start, base.len() - start, ""])?;
    }
    Ok(())
}

/// 合并时更新传统全文快照，触发器原子清除已消费的改动。
pub fn consolidate(db: &Connection, id: i64, body: &str) -> rusqlite::Result<()> {
    db.execute(
        "UPDATE notes SET body=?2 WHERE id=?1 AND EXISTS(SELECT 1 FROM draft_pieces WHERE note=?1)",
        params![id, body],
    )?;
    Ok(())
}
