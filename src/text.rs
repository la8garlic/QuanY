//! WebView 编辑统一使用 LF；写回文件时沿用原编码和换行约定。
use crate::files::Result;
use crate::language::tr;

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
    newline: &'static str,
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
        let newline = match text.find(['\r', '\n']).map(|i| &text[i..]) {
            Some(s) if s.starts_with("\r\n") => "\r\n",
            Some(s) if s.starts_with('\r') => "\r",
            Some(_) => "\n",
            None => "\r\n",
        };
        Ok(Self {
            body: text.replace("\r\n", "\n").replace('\r', "\n"),
            encoding,
            newline,
        })
    }
    pub fn encode(&self, body: &str) -> Vec<u8> {
        let text = body.replace('\n', self.newline);
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
