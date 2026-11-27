//! WebView 编辑统一使用 LF；写回文件时沿用原编码和换行约定。
use crate::files::Result;
use crate::language::tr;
use std::collections::HashMap;

#[derive(Clone, Copy)]
enum Encoding {
    Utf8,
    Bom,
    Le,
    Be,
}
pub struct Text {
    pub body: String,
    encoding: Encoding,
    newline: Ending,
    mixed: Vec<Ending>,
}

#[derive(Clone, Copy, PartialEq)]
enum Ending {
    Lf,
    Cr,
    CrLf,
}

impl Ending {
    fn as_str(self) -> &'static str {
        match self {
            Self::Lf => "\n",
            Self::Cr => "\r",
            Self::CrLf => "\r\n",
        }
    }
}

impl Text {
    pub fn read(raw: &[u8]) -> Result<Self> {
        let (encoding, data) = if let Some(s) = raw.strip_prefix(&[0xef, 0xbb, 0xbf]) {
            (Encoding::Bom, s)
        } else if let Some(s) = raw.strip_prefix(&[0xff, 0xfe]) {
            (Encoding::Le, s)
        } else if let Some(s) = raw.strip_prefix(&[0xfe, 0xff]) {
            (Encoding::Be, s)
        } else {
            (Encoding::Utf8, raw)
        };
        let text = match encoding {
            Encoding::Utf8 | Encoding::Bom => std::str::from_utf8(data)
                .map_err(|_| {
                    tr(
                        "无法按 UTF-8 读取，请选用 UTF-8 或带 BOM 的 UTF-16 文本。",
                        "Use UTF-8 or UTF-16 text with a byte order mark for UTF-16.",
                    )
                })?
                .to_owned(),
            Encoding::Le | Encoding::Be => {
                let (pairs, rest) = data.as_chunks::<2>();
                if !rest.is_empty() {
                    return Err(tr(
                        "UTF-16 文件末尾不完整。",
                        "Incomplete UTF-16 character at the end of the file.",
                    )
                    .into());
                }
                let units: Vec<_> = pairs
                    .iter()
                    .map(|p| {
                        if matches!(encoding, Encoding::Le) {
                            u16::from_le_bytes(*p)
                        } else {
                            u16::from_be_bytes(*p)
                        }
                    })
                    .collect();
                String::from_utf16(&units)?
            }
        };
        if text.contains('\0') {
            return Err(tr(
                "文件含空字符，请选择纯文本文件。",
                "The file contains null characters. Choose a plain-text file.",
            )
            .into());
        }
        let mut breaks = text.match_indices(['\r', '\n']).peekable();
        let mut newline = Ending::CrLf;
        let mut mixed = Vec::new();
        let mut line = 0;
        while let Some((at, ch)) = breaks.next() {
            let ending = if ch == "\n" {
                Ending::Lf
            } else if breaks.next_if_eq(&(at + 1, "\n")).is_some() {
                Ending::CrLf
            } else {
                Ending::Cr
            };
            if line == 0 {
                newline = ending;
            }
            if mixed.is_empty() && ending != newline {
                mixed.resize(line, newline);
            }
            if !mixed.is_empty() {
                mixed.push(ending);
            }
            line += 1;
        }
        Ok(Self {
            body: text.replace("\r\n", "\n").replace('\r', "\n"),
            encoding,
            newline,
            mixed,
        })
    }

    // 用未改动的行对齐新旧稿；替换沿用旧行的分隔符，插入沿用相邻行。
    fn restore_endings(&self, body: &str) -> String {
        if self.mixed.is_empty() {
            return body.replace('\n', self.newline.as_str());
        }
        let old: Vec<_> = self.body.split('\n').collect();
        let new: Vec<_> = body.split('\n').collect();
        let prefix = old.iter().zip(&new).take_while(|(a, b)| a == b).count();
        let suffix = old[prefix..]
            .iter()
            .rev()
            .zip(new[prefix..].iter().rev())
            .take_while(|(a, b)| a == b)
            .count();
        let mut positions: HashMap<&str, Vec<usize>> = HashMap::new();
        for (offset, line) in old[prefix..old.len() - suffix].iter().enumerate() {
            positions.entry(line).or_default().push(prefix + offset);
        }
        let mut endings = vec![None; new.len()];
        let mut old_line = 0;
        let mut new_line = 0;
        // 最后的哨兵使末尾的替换段与中间的替换段走同一条路径。
        for i in 0..=new.len() {
            let anchor = if i == new.len() {
                Some(old.len())
            } else if i < prefix {
                Some(i)
            } else if i >= new.len() - suffix {
                Some(old.len() - (new.len() - i))
            } else {
                positions
                    .get(new[i])
                    .and_then(|indices| indices.get(indices.partition_point(|&n| n < old_line)))
                    .copied()
            };
            let Some(stop) = anchor else { continue };
            for (slot, source) in endings[new_line..i].iter_mut().zip(old_line..stop) {
                *slot = self.mixed.get(source).copied();
            }
            if i < new.len() {
                endings[i] = self.mixed.get(stop).copied();
            }
            old_line = stop + 1;
            new_line = i + 1;
        }
        let mut result = String::with_capacity(body.len());
        let mut nearby = self.newline;
        for (i, line) in new.iter().enumerate() {
            result.push_str(line);
            if i + 1 < new.len() {
                nearby = endings[i].unwrap_or(nearby);
                result.push_str(nearby.as_str());
            }
        }
        result
    }
    pub fn encode(&self, body: &str) -> Vec<u8> {
        let text = self.restore_endings(body);
        match self.encoding {
            Encoding::Utf8 => text.into_bytes(),
            Encoding::Bom => [b"\xef\xbb\xbf".as_slice(), text.as_bytes()].concat(),
            Encoding::Le => [
                vec![0xff, 0xfe],
                text.encode_utf16().flat_map(u16::to_le_bytes).collect(),
            ]
            .concat(),
            Encoding::Be => [
                vec![0xfe, 0xff],
                text.encode_utf16().flat_map(u16::to_be_bytes).collect(),
            ]
            .concat(),
        }
    }
}
