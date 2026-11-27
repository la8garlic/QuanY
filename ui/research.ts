/** 逐行比较两版正文；长稿先剔除共同首尾，限制对照矩阵的内存。 */
import { library, type Entry, type Written } from "./ipc.js";
import { body, el, title, untitled } from "./view.js";
type Change = { kind: "add" | "del" | "same"; line: string };

function changes(oldText: string, newText: string): Change[] {
  const a = oldText.split("\n"),
    b = newText.split("\n");
  let start = 0,
    endA = a.length,
    endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start,
    m = endB - start,
    out: Change[] = [];
  if (!n && !m) return out;
  if (start) out.push({ kind: "same", line: a[start - 1]! });
  if ((n + 1) * (m + 1) > 450000) {
    for (let i = start; i < endA; i++) out.push({ kind: "del", line: a[i]! });
    for (let j = start; j < endB; j++) out.push({ kind: "add", line: b[j]! });
  } else {
    const cols = m + 1,
      lcs = new Uint32Array((n + 1) * cols);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) {
        const k = i * cols + j;
        lcs[k] =
          a[start + i] === b[start + j] ? 1 + lcs[k + cols + 1]! : Math.max(lcs[k + cols]!, lcs[k + 1]!);
      }
    let i = 0,
      j = 0;
    while (i < n || j < m) {
      const k = i * cols + j;
      if (i < n && j < m && a[start + i] === b[start + j]) {
        out.push({ kind: "same", line: a[start + i++]! });
        j++;
      } else if (i < n && (j === m || lcs[k + cols]! >= lcs[k + 1]!))
        out.push({ kind: "del", line: a[start + i++]! });
      else out.push({ kind: "add", line: b[start + j++]! });
    }
  }
  if (endA < a.length) out.push({ kind: "same", line: a[endA]! });
  return out;
}

const history = el<HTMLDialogElement>("history"),
  versions = el<HTMLSelectElement>("version-list");
const ref = el("reference"),
  choice = el<HTMLSelectElement>("ref-choice");
const restoreButton = el<HTMLButtonElement>("restore");
let selected: Written | null = null,
  confirming = false,
  historyToken = 0,
  refToken = 0;
type Task = (task: () => Promise<void>, saveFirst?: boolean) => Promise<unknown>;
export function initResearch(
  noteId: () => number,
  entries: () => Entry[],
  run: Task,
  restore: (v: Written) => Promise<void>,
  report: (e: unknown) => void,
) {
  async function showVersion() {
    const token = ++historyToken;
    confirming = false;
    selected = null;
    restoreButton.disabled = true;
    restoreButton.textContent = "恢复此版";
    const pane = el("changes");
    pane.replaceChildren();
    if (!versions.value) {
      el("version-state").textContent = "暂无历史版本。可先保存当前版本，再继续修改。";
      return;
    }
    const version = await library.version(noteId(), Number(versions.value));
    if (token !== historyToken || !history.open) return;
    selected = version;
    const lines = changes(version.body, body.value),
      titleChanged = version.title !== title.value;
    const append = (kind: string, text: string) => {
      const line = document.createElement("div");
      line.className = "diff-" + kind;
      line.textContent = text;
      pane.append(line);
    };
    if (titleChanged) {
      append("del", "− 标题：" + (version.title || untitled));
      append("add", "＋ 标题：" + (title.value || untitled));
    }
    const interesting = lines.filter(
      (v, i) => v.kind !== "same" || lines[i - 1]?.kind !== "same" || lines[i + 1]?.kind !== "same",
    );
    for (const v of interesting.slice(0, 500))
      append(v.kind, { add: "＋ ", del: "− ", same: "　 " }[v.kind] + v.line);
    restoreButton.disabled = !lines.length && !titleChanged;
    el("version-state").textContent = restoreButton.disabled
      ? "与当前稿一致"
      : "− 历史版　＋ 当前稿" + (interesting.length > 500 ? "　仅预览前 500 行差异" : "");
  }
  async function loadVersions() {
    const items = await library.revisions(noteId());
    versions.replaceChildren(
      ...items.map(
        (v) =>
          new Option(
            new Date(v.written).toLocaleString("zh-CN") + " · " + (v.title || untitled),
            String(v.seq),
          ),
      ),
    );
    await showVersion();
  }
  el("history-open").onclick = () =>
    run(async () => {
      history.showModal();
      await loadVersions();
    });
  el("history-close").onclick = () => history.close();
  versions.onchange = () => void showVersion().catch(report);
  el("checkpoint").onclick = () =>
    run(async () => {
      await library.mark(noteId());
      await loadVersions();
    });
  restoreButton.onclick = () => {
    if (!selected) return;
    if (!confirming) {
      confirming = true;
      restoreButton.textContent = "确认恢复此版";
      return;
    }
    const version = selected;
    void run(async () => {
      await library.mark(noteId());
      history.close();
      await restore(version);
    });
  };
  async function readRef() {
    const token = ++refToken;
    if (!choice.value) {
      el("ref-body").textContent = "稿本中还没有其他手稿。";
      return;
    }
    const text = await library.reference(Number(choice.value));
    if (token === refToken) el("ref-body").textContent = text.body;
  }
  function refOptions() {
    const id = choice.value;
    const notes = entries().filter((e) => e.id !== noteId());
    choice.replaceChildren(...notes.map((e) => new Option(e.title || untitled, String(e.id))));
    if (notes.some((n) => String(n.id) === id)) choice.value = id;
    choice.disabled = !notes.length;
    void readRef().catch(report);
  }
  el("reference-open").onclick = () => {
    ref.hidden = !ref.hidden;
    if (!ref.hidden) refOptions();
  };
  el("ref-close").onclick = () => {
    ref.hidden = true;
    body.focus();
  };
  choice.onchange = () => void readRef().catch(report);
  const memoList = el<HTMLDialogElement>("memo-list");
  el("memos").onclick = () =>
    run(async () => {
      const memos = await library.memos();
      const list = el("memo-items");
      list.replaceChildren();
      for (const memo of memos) {
        const b = document.createElement("button");
        b.textContent = memo.preview.trim() || "空白便笺";
        b.onclick = () =>
          void run(async () => {
            await library.openMemo(memo.id);
            memoList.close();
          }, false);
        list.append(b);
      }
      if (!memos.length) list.textContent = "尚无便笺。新建后可把提纲钉在桌面上。";
      memoList.showModal();
    });
  el("create-memo").onclick = () =>
    run(async () => {
      await library.openMemo(null);
      memoList.close();
    }, false);
  return () => {
    if (!ref.hidden) refOptions();
  };
}
