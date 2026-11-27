import { StateField } from "@codemirror/state";

/** 字数按 Unicode 码点统计，正文与选区采用相同的非空白计数口径。 */
export function characterCount(text: string) {
  let n = 0;
  for (const ch of text) if (!/\s/u.test(ch)) n++;
  return n;
}

export const characters = StateField.define<number>({
  create(state) {
    let total = 0;
    for (const line of state.doc) total += characterCount(line);
    return total;
  },
  update(total, transaction) {
    if (!transaction.docChanged) return total;
    const before = transaction.startState.doc, after = transaction.newDoc;
    let oldStart = 0, oldEnd = 0, newStart = 0, newEnd = 0;
    function apply() {
      total += characterCount(after.sliceString(newStart, newEnd)) - characterCount(before.sliceString(oldStart, oldEnd));
    }
    // 各带一个相邻码元，覆盖插入/删除恰好拆开或接合代理对的情况。
    transaction.changes.iterChangedRanges((a, b, x, y) => {
      const left = Math.max(0, a - 1);
      if (left > oldEnd) {
        apply();
        oldStart = left;
        newStart = Math.max(0, x - 1);
      }
      oldEnd = Math.min(before.length, b + 1);
      newEnd = Math.min(after.length, y + 1);
    });
    apply();
    return total;
  },
});

export function manuscriptStats(text: string, from: number, to: number, total: number) {
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
    字数: total,
    选区: characterCount(text.slice(from, to)),
    行数: lines,
    段落: paragraphs,
  };
}
