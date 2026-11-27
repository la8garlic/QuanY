import type { Text } from "@codemirror/state";

const stride = 128;
type Matches = { count: number; anchors: number[] };

/** 查找框只接受单行字串，匹配不会跨越文档树子节点之间的换行。 */
export class LiteralIndex {
  private readonly blocks = new WeakMap<Text, Matches>();

  constructor(readonly query: string) {
    if (!query.length) throw new RangeError("Empty search query");
  }

  private block(node: Text): Matches {
    const known = this.blocks.get(node);
    if (known) return known;
    const result: Matches = { count: 0, anchors: [] };
    if (node.children) {
      for (const child of node.children) result.count += this.block(child).count;
    } else {
      const text = node.toString();
      for (let at = text.indexOf(this.query); at >= 0; at = text.indexOf(this.query, at + this.query.length)) {
        if (result.count % stride === 0) result.anchors.push(at);
        result.count++;
      }
    }
    this.blocks.set(node, result);
    return result;
  }

  count(doc: Text) { return this.block(doc).count; }

  private seek(node: Text, edge: number, back: boolean): number {
    if ((back ? edge <= 0 : edge >= node.length) || !this.block(node).count) return -1;
    if (node.children) {
      const children = node.children;
      let offset = back ? node.length + 1 : 0;
      for (let i = back ? children.length - 1 : 0; i >= 0 && i < children.length; i += back ? -1 : 1) {
        const child = children[i]!;
        if (back) offset -= child.length + 1;
        const found = this.seek(child, edge - offset, back);
        if (found >= 0) return offset + found;
        if (!back) offset += child.length + 1;
      }
      return -1;
    }

    // 从最近的稀疏锚点沿正向重放，使“上一个”和替换在重叠字串上选中同一组位置。
    const { anchors } = this.block(node);
    let lo = 0, hi = anchors.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (anchors[mid]! < edge) lo = mid + 1;
      else hi = mid;
    }
    const text = node.toString();
    let previous = -1, at = anchors[Math.max(0, lo - 1)]!;
    while (at >= 0 && at < edge) {
      previous = at;
      at = text.indexOf(this.query, at + this.query.length);
    }
    return back ? previous : at;
  }

  /** 调用方已确认至少有一处匹配；到达文端后环绕一次。 */
  nearest(doc: Text, edge: number, back: boolean) {
    const found = this.seek(doc, edge, back);
    return found >= 0 ? found : this.seek(doc, back ? doc.length : 0, back);
  }
}
