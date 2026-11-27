import { desktop, library, type Desk, type Entry, type Note, type Place } from "./ipc.js";
import { body, count, el, list, search, setFocusMode, settings, status, title, untitled } from "./view.js";

let entries: Entry[] = [];
let current: number;
let lastPlace: Place;
let revision = 0, committed = 0;
let pending: Promise<void> | undefined;
let quiet: number, deadline: number | undefined;
let ready = false, busy = false;
const file = el<HTMLInputElement>("file");
const confirm = el<HTMLDialogElement>("confirm");

function errorMessage(error: unknown, retry?: () => void) {
  el("error-text").textContent = String(error);
  el("error").hidden = false;
  el("retry").textContent = retry ? "重试" : "知道了";
  el("retry").onclick = () => { el("error").hidden = true; retry?.(); };
}

function open(note: Note) {
  current = note.id;
  title.value = note.title;
  body.value = note.body;
  lastPlace = note.place;
  body.setSelectionRange(lastPlace.start, lastPlace.end);
  body.scrollTop = lastPlace.top;
  revision = committed = 0;
  el("error").hidden = true;
  count(note.body);
  status("已保存到本机");
  list(entries, current);
}

function show(desk: Desk) {
  entries = desk.entries;
  search.value = "";
  open(desk.note);
}

function stopTimers() {
  clearTimeout(quiet);
  clearTimeout(deadline);
  deadline = undefined;
}

async function write() {
  // 同一时刻仅允许一笔写入。等待磁盘时仍可输入，旧应答只确认它携带的版本。
  while (committed < revision) {
    const version = revision, text = body.value;
    status("正在保存", "dirty");
    const place = position();
    const entry = await library.save(current, title.value, text, place);
    lastPlace = place;
    committed = version;
    entries = [entry, ...entries.filter(item => item.id !== current)];
    list(entries, current);
    count(text);
  }
  status("已保存到本机");
}

function position(): Place {
  return { start: body.selectionStart, end: body.selectionEnd, top: body.scrollTop };
}

async function flush() {
  stopTimers();
  if (committed === revision) return true;
  pending ??= write().finally(() => { pending = undefined; });
  try {
    await pending;
    if (el("error").dataset.kind === "save") el("error").hidden = true;
    return true;
  } catch (error) {
    status("尚未保存", "error");
    el("error").dataset.kind = "save";
    errorMessage(error, autoSave);
    return false;
  }
}

function autoSave() {
  void flush();
}

function changed() {
  revision++;
  status("等待保存", "dirty");
  clearTimeout(quiet);
  quiet = window.setTimeout(autoSave, 650);
  deadline ??= window.setTimeout(autoSave, 4000);
}
title.oninput = body.oninput = changed;
window.addEventListener("blur", autoSave);

body.addEventListener("beforeinput", e => {
  // WebView2 会把多行 insertText 拆成逐段编辑；大段听写或批量输入时一次提交可保留原生撤销。
  if (!e.cancelable || e.isComposing || e.inputType !== "insertText" || !e.data || e.data.length < 4096 || !e.data.includes("\n")) return;
  const text = e.data.replace(/\r\n?/g, "\n");
  const start = body.selectionStart, end = body.selectionEnd;
  const expected = body.value.slice(0, start) + text + body.value.slice(end);
  const span = document.createElement("span");
  span.style.whiteSpace = "pre-wrap";
  // 只传文本节点。系统编辑命令会折叠末尾的一个换行，额外补回该换行。
  span.textContent = text.endsWith("\n") ? text + "\n" : text;
  if (!document.execCommand("insertHTML", false, span.outerHTML)) return;
  if (body.value === expected) {
    e.preventDefault();
  } else {
    // 系统转换若改变了任意字符，撤回这次替换，让原来的纯文本输入照常完成。
    document.execCommand("undo");
    body.setSelectionRange(start, end);
  }
});

async function action(task: () => Promise<void>, saveFirst = true) {
  if (busy || !ready) return;
  busy = true;
  title.readOnly = body.readOnly = true;
  try {
    if (saveFirst) {
      if (!await flush()) return;
      const place = position();
      if (place.start !== lastPlace.start || place.end !== lastPlace.end || place.top !== lastPlace.top) {
        await library.bookmark(current, place);
        lastPlace = place;
      }
    }
    await task();
  } catch (error) {
    el("error").dataset.kind = "action";
    errorMessage(error);
  } finally {
    title.readOnly = body.readOnly = busy = false;
  }
}

el("new").onclick = () => action(async () => {
  show(await library.create("", ""));
  body.focus();
});
el("notes").onclick = e => {
  const item = (e.target as Element).closest<HTMLButtonElement>("button[data-id]");
  if (item && Number(item.dataset.id) !== current) void action(async () => {
    open(await library.select(Number(item.dataset.id)));
    body.focus();
  });
};
search.oninput = () => list(entries, current);
el("import").onclick = () => { if (ready && !busy) file.click(); };
file.onchange = () => {
  const source = file.files?.[0];
  file.value = "";
  if (!source) return;
  void action(async () => {
    const bytes = new Uint8Array(await source.arrayBuffer());
    let encoding = "utf-8";
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
    if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
    let text: string;
    try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
    catch (cause) { throw new Error("无法读取文本编码，请使用 UTF-8 或带 BOM 的 UTF-16 文本。", { cause }); }
    if (text.includes("\0")) throw new Error("文件含有空字符，请选择纯文本文件。");
    show(await library.create(source.name.replace(/\.[^.]+$/, ""), text.replace(/\r\n?/g, "\n")));
    body.focus();
  });
};
el("export").onclick = () => action(async () => {
  // 即使稿本磁盘写满，仍允许把当前屏幕上的文字导出到另一块磁盘。
  const name = title.value.trim() || body.value.slice(0, 80).trim().split("\n")[0] || untitled;
  await library.export(name, body.value);
}, false);
el("remove").onclick = () => {
  if (!ready || busy) return;
  el("panel").hidden = true;
  el("options").setAttribute("aria-expanded", "false");
  el("confirm-text").textContent = "“" + (title.value.trim() || body.value.slice(0, 32).trim() || untitled) + "” 将从本机稿本中永久删除。";
  confirm.returnValue = "cancel";
  confirm.showModal();
};
confirm.onclose = () => {
  if (confirm.returnValue === "delete") void action(async () => {
    show(await library.remove(current));
    body.focus();
  });
};

document.addEventListener("keydown", e => {
  if (e.isComposing || !ready || confirm.open) return;
  const key = e.key.toLowerCase();
  // 桌面编辑器里刷新页面会绕过关闭保存流程。
  if (key === "f5" || (e.ctrlKey && key === "r")) e.preventDefault();
  if (key === "enter" && e.target === title) { e.preventDefault(); body.focus(); }
  if (e.ctrlKey && !e.altKey && ["n", "o", "s"].includes(key)) {
    e.preventDefault();
    if (key === "n") el("new").click();
    if (key === "o") el("import").click();
    if (key === "s" && e.shiftKey) el("export").click();
    if (key === "s" && !e.shiftKey) autoSave();
  }
  if (key === "f8") { e.preventDefault(); el("focus").click(); }
  if (key === "escape" && document.body.classList.contains("focused")) setFocusMode(false);
});

async function boot() {
  try {
    show(await library.start());
    await desktop.onCloseRequested(async e => {
      e.preventDefault();
      if (busy) return;
      body.blur();
      title.blur();
      await action(() => desktop.destroy());
    });
    title.disabled = body.disabled = false;
    ready = true;
    body.focus();
  } catch (error) {
    status("稿本未打开", "error");
    errorMessage(error, boot);
  }
}
settings();
void boot();
