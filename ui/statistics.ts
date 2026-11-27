/** 字数按 Unicode 码点统计，正文与选区采用相同的非空白计数口径。 */
export function characterCount(text: string) {
  let n = 0;
  for (const ch of text) if (!/\s/u.test(ch)) n++;
  return n;
}

export function manuscriptStats(text: string, from: number, to: number) {
  let lines = text ? 1 : 0,
    paragraphs = 0,
    inParagraph = false,
    content = false;
  for (const ch of text) {
    if (ch === "\n") {
      lines++;
      inParagraph = content;
      content = false;
    } else if (!/\s/u.test(ch)) {
      if (!inParagraph && !content) paragraphs++;
      content = true;
    }
  }
  return {
    字数: characterCount(text),
    选区: characterCount(text.slice(from, to)),
    行数: lines,
    段落: paragraphs,
  };
}
