//! 正文文件和恢复稿分别保存。记录上次写出的原始字节，便于检查外部修改和沿用文本格式。
use crate::text::Text;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    error::Error,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

pub type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

pub fn folder(db: &Connection) -> rusqlite::Result<String> {
    db.query_row("SELECT folder FROM save_options WHERE slot=1", [], |r| {
        r.get(0)
    })
}

/// 仅迁移旧系统默认目录中的直接关联文件；保留原件和原始基线，供恢复与外部修改检测。
pub fn upgrade_default_folder(
    db: &mut Connection,
    documents: &Path,
) -> std::result::Result<(), Box<dyn Error>> {
    let old = documents.join("笺记");
    let new = documents.join("泉涌");
    let tx = db.transaction()?;
    if !Path::new(&folder(&tx)?)
        .as_os_str()
        .eq_ignore_ascii_case(old.as_os_str())
    {
        return Ok(());
    }
    fs::create_dir_all(&new)?;
    let mut links = tx.prepare("SELECT note,path FROM links ORDER BY note")?;
    let rows = links
        .query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, PathBuf::from(r.get::<_, String>(1)?)))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(links);
    for (id, source) in rows {
        if !source
            .parent()
            .is_some_and(|p| p.as_os_str().eq_ignore_ascii_case(old.as_os_str()))
        {
            continue;
        }
        let bytes = match fs::read(&source) {
            Ok(data) => data,
            Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e.into()),
        };
        let name = source.file_name().expect("关联文件有文件名");
        for suffix in 0_u32.. {
            let target = if suffix == 0 {
                new.join(name)
            } else {
                new.join(format!("迁移-{id}-{suffix}-{}", name.to_string_lossy()))
            };
            let path = target.to_string_lossy();
            if tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM links WHERE path=?1)",
                [path.as_ref()],
                |r| r.get::<_, bool>(0),
            )? {
                continue;
            }
            // 无覆盖地发布；若在文件落盘后、事务提交前退出，下次可复用同一份完整副本。
            match staged(&new, &bytes)?.persist_noclobber(&target) {
                Ok(_) => {}
                Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => {
                    if !target.is_file() || fs::read(&target)? != bytes {
                        continue;
                    }
                }
                Err(e) => return Err(e.error.into()),
            }
            tx.execute(
                "UPDATE links SET path=?1 WHERE note=?2",
                params![path.as_ref(), id],
            )?;
            break;
        }
    }
    tx.execute(
        "UPDATE save_options SET folder=?1 WHERE slot=1",
        [new.to_string_lossy().as_ref()],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn change_folder(db: &Connection, path: &Path) -> Result<String> {
    if !path.is_absolute() {
        return Err("请输入完整目录，例如 D:\\写作。".into());
    }
    fs::create_dir_all(path)?;
    NamedTempFile::new_in(path)?.close()?;
    let text = path.to_string_lossy();
    db.execute(
        "UPDATE save_options SET folder=?1 WHERE slot=1",
        [text.as_ref()],
    )?;
    Ok(text.into_owned())
}

pub fn filename(title: &str) -> String {
    let clean: String = title
        .trim()
        .chars()
        .take(64)
        .map(|c| {
            if c.is_control() || r#"<>:"/\|?*"#.contains(c) {
                '＿'
            } else {
                c
            }
        })
        .collect();
    let stem = clean.trim_end_matches([' ', '.']);
    let name = if stem.is_empty() {
        "未命名手稿"
    } else {
        stem
    };
    let prefix = name
        .split('.')
        .next()
        .expect("文件名至少有一段")
        .to_ascii_uppercase();
    let reserved = matches!(
        prefix.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|p| {
        prefix.strip_prefix(p).is_some_and(|n| {
            matches!(
                n,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    });
    format!("{}{name}.txt", if reserved { "_" } else { "" })
}

fn staged(dir: &Path, bytes: &[u8]) -> io::Result<NamedTempFile> {
    let mut file = NamedTempFile::new_in(dir)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    Ok(file)
}

fn bind(db: &mut Connection, id: i64, path: &Path, bytes: &[u8]) -> Result<()> {
    let tx = db.transaction()?;
    tx.execute(
        "INSERT INTO links(note,path,baseline) VALUES(?1,?2,?3)
        ON CONFLICT(note) DO UPDATE SET path=excluded.path,baseline=excluded.baseline",
        params![id, path.to_string_lossy(), bytes],
    )?;
    tx.execute("DELETE FROM outbox WHERE note=?1", [id])?;
    tx.commit()?;
    Ok(())
}

pub fn publish(
    db: &mut Connection,
    id: i64,
    title: &str,
    body: &str,
    destination: Option<&Path>,
) -> Result<String> {
    let link = db
        .query_row("SELECT path,baseline FROM links WHERE note=?1", [id], |r| {
            Ok((
                PathBuf::from(r.get::<_, String>(0)?),
                r.get::<_, Vec<u8>>(1)?,
            ))
        })
        .optional()?;
    let format = match &link {
        Some((_, base)) => Text::read(base)?,
        None => Text::read(&[])?,
    };
    let data = match &link {
        Some((_, base)) if format.body == body => base.clone(),
        _ => format.encode(body),
    };
    let target = match (destination, &link) {
        (Some(path), _) => {
            if !path
                .extension()
                .is_some_and(|s| s.eq_ignore_ascii_case("txt"))
            {
                return Err("请选择扩展名为 .txt 的文件。".into());
            }
            let owner: Option<i64> = db
                .query_row(
                    "SELECT note FROM links WHERE path=?1 COLLATE NOCASE",
                    [path.to_string_lossy().as_ref()],
                    |r| r.get(0),
                )
                .optional()?;
            if owner.is_some_and(|n| n != id) {
                return Err("此文件已在另一篇手稿中打开，请选择其他名称。".into());
            }
            path.to_owned()
        }
        (None, Some((path, _))) => path.clone(),
        (None, None) => {
            let dir = PathBuf::from(folder(db)?);
            fs::create_dir_all(&dir)?;
            let name = filename(title);
            let stem = name.strip_suffix(".txt").expect("新稿文件使用 txt 扩展名");
            let mut temp = staged(&dir, &data)?;
            for n in 1u64.. {
                let path = dir.join(if n == 1 {
                    name.clone()
                } else {
                    format!("{stem} ({n}).txt")
                });
                // 移走的原文件仍可能关联着别的恢复稿，不能借用它的名字。
                let reserved: bool = db.query_row(
                    "SELECT EXISTS(SELECT 1 FROM links WHERE path=?1)",
                    [path.to_string_lossy().as_ref()],
                    |r| r.get(0),
                )?;
                if reserved {
                    continue;
                }
                match temp.persist_noclobber(&path) {
                    Ok(_) => {
                        bind(db, id, &path, &data)?;
                        return Ok(path.to_string_lossy().into_owned());
                    }
                    Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => temp = e.file,
                    Err(e) => return Err(e.error.into()),
                }
            }
            unreachable!()
        }
    };
    let same_link = link.as_ref().filter(|(p, _)| {
        p == &target
            || p.to_string_lossy()
                .eq_ignore_ascii_case(&target.to_string_lossy())
    });
    let dir = target.parent().ok_or("文件缺少上级目录")?;
    let temp = staged(dir, &data)?;
    if let Some((_, base)) = same_link {
        let disk = fs::read(&target)
            .map_err(|e| format!("无法读取原文件 {}：{e}，可另存为。", target.display()))?;
        if disk == data {
            bind(db, id, &target, &data)?;
            return Ok(target.to_string_lossy().into_owned());
        }
        if disk != *base {
            return Err(
                "原文件已被其他程序修改。当前文字已保留在稿本中，请另存为，避免覆盖外部修改。"
                    .into(),
            );
        }
    }
    temp.persist(&target)?;
    bind(db, id, &target, &data)?;
    Ok(target.to_string_lossy().into_owned())
}

pub fn open(db: &mut Connection, path: &Path) -> Result<crate::storage::Desk> {
    let data = fs::read(path)?;
    let text = Text::read(&data)?;
    let title = path.file_stem().ok_or("无法读取文件名")?.to_string_lossy();
    let tx = db.transaction()?;
    let existing = tx
        .query_row(
            "SELECT note FROM links WHERE path=?1 COLLATE NOCASE",
            [path.to_string_lossy().as_ref()],
            |r| r.get::<_, i64>(0),
        )
        .optional()?;
    let id = match existing {
        Some(id) => {
            let pending: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM outbox WHERE note=?1)",
                [id],
                |r| r.get(0),
            )?;
            if pending {
                return Err("这篇手稿还有待写入的修改，请先另存为。".into());
            }
            crate::storage::reload_body(&tx, id, &text.body)?;
            id
        }
        None => crate::storage::insert(&tx, &title, &text.body)?,
    };
    tx.execute("INSERT INTO links(note,path,baseline) VALUES(?1,?2,?3) ON CONFLICT(note) DO UPDATE SET baseline=excluded.baseline",
        params![id,path.to_string_lossy(),data])?;
    tx.execute("UPDATE desk SET note=?1 WHERE slot=1", [id])?;
    let desk = crate::storage::desk(&tx)?;
    tx.commit()?;
    Ok(desk)
}

/// 打开已关联的稿件时重读磁盘。移动盘离线或外部文件损坏时仍能打开恢复稿。
pub fn refresh(db: &mut Connection, id: i64) -> Result<Option<String>> {
    let link = db
        .query_row(
            "SELECT path,baseline FROM links WHERE note=?1 AND NOT EXISTS
        (SELECT 1 FROM outbox WHERE note=?1)",
            [id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?)),
        )
        .optional()?;
    let Some((path, baseline)) = link else {
        return Ok(None);
    };
    let data = match fs::read(&path) {
        Ok(data) => data,
        Err(e) => return Ok(Some(format!("已打开本地恢复稿。原文件无法读取：{e}"))),
    };
    if baseline == data {
        return Ok(None);
    }
    let text = match Text::read(&data) {
        Ok(text) => text,
        Err(e) => return Ok(Some(format!("已打开本地恢复稿。原文件解码失败：{e}"))),
    };
    let tx = db.transaction()?;
    crate::storage::reload_body(&tx, id, &text.body)?;
    tx.execute(
        "UPDATE links SET baseline=?1 WHERE note=?2",
        params![data, id],
    )?;
    tx.commit()?;
    Ok(None)
}
