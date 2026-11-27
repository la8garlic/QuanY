import { StateField, type EditorState, type Text } from "@codemirror/state";

/** 字数按 Unicode 码点统计，正文与选区采用相同的非空白计数口径。 */
function characterCount(text: string) {
  // 普通汉字和 ASCII 直接按 UTF-16 长度计数，只扣除空白和代理对多出的一个码元。
  const exceptions = /(\s+)|[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  let n = text.length, match: RegExpExecArray | null;
  while ((match = exceptions.exec(text)) !== null)
    n -= match[1] === undefined ? 1 : match[1].length;
  return n;
}

type Summary = { characters: number; paragraphs: number; firstHasText: boolean; lastHasText: boolean };
const summaries = new WeakMap<Text, Summary>();

function summary(node: Text): Summary {
  const cached = summaries.get(node);
  if (cached) return cached;
  const stats = { characters: 0, paragraphs: 0, firstHasText: false, lastHasText: false };
  if (node.children) {
    for (const child of node.children) {
      const part = summary(child);
      if (child === node.children[0]) stats.firstHasText = part.firstHasText;
      stats.characters += part.characters;
      // 子树之间是一处换行；两侧都是非空行时，计作同一个自然段。
      stats.paragraphs += part.paragraphs - Number(stats.lastHasText && part.firstHasText);
      stats.lastHasText = part.lastHasText;
    }
  } else {
    let first = true;
    for (const line of node.iterLines()) {
      const count = characterCount(line), hasText = count > 0;
      if (first) stats.firstHasText = hasText;
      if (hasText && !stats.lastHasText) stats.paragraphs++;
      stats.characters += count;
      stats.lastHasText = hasText;
      first = false;
    }
  }
  summaries.set(node, stats);
  return stats;
}

function rangeCount(node: Text, from: number, to: number): number {
  if (from === to) return 0;
  if (from === 0 && to === node.length) return summary(node).characters;
  if (!node.children) return characterCount(node.sliceString(from, to));
  let count = 0, offset = 0;
  for (const child of node.children) {
    if (offset >= to) break;
    const end = offset + child.length;
    if (from < end) count += rangeCount(child, Math.max(0, from - offset), Math.min(to, end) - offset);
    offset = end + 1;
  }
  return count;
}

export const characters = StateField.define<number>({
  create(state) {
    return summary(state.doc).characters;
  },
  update(total, transaction) {
    if (!transaction.docChanged) return total;
    const before = transaction.startState.doc, after = transaction.newDoc;
    let oldStart = 0, oldEnd = 0, newStart = 0, newEnd = 0;
    function apply() {
      total += rangeCount(after, newStart, newEnd) - rangeCount(before, oldStart, oldEnd);
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

export function manuscriptStats(state: EditorState) {
  const { doc, selection } = state;
  const stats = summary(doc);
  return {
    字数: stats.characters,
    选区: rangeCount(doc, selection.main.from, selection.main.to),
    行数: doc.length ? doc.lines : 0,
    段落: stats.paragraphs,
  };
}
