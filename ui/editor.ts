import { initKeys, localAction } from "./shortcuts.js";
import { desktop, standby, library, type Desk, type Entry, type Note, type Place, type Saved } from "./ipc.js";
import { initFind, openFind, resetFind } from "./find.js";
import { body, count, el, list, search, setFocusMode, settings, setDirectory, saveDelay, status, title, untitled } from "./view.js";

let entries: Entry[] = [];
let current: number;
let lastPlace: Place;
let revision = 0, committed = 0;
let pending: Promise<void> | undefined;
let quiet: number, deadline: number | undefined;
let ready = false, busy = false;
let path: string | null;
let folder: string;
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
  path = note.path;
  committed = 0;
  revision = note.pending ? 1 : 0;
  displayPath();
  resetFind();
  el("error").hidden = true;
  count(note.body);
  status(note.pending ? "TXT 待写入" : path ? "已保存" : "本地草稿", note.pending ? "dirty" : "saved");
  if (note.notice) { status("本地恢复稿"); errorMessage(note.notice); }
  list(entries, current);
}

function show(desk: Desk) {
  folder = desk.folder;
  setDirectory(folder);
  entries = desk.entries;
  search.value = "";
  open(desk.note);
}

function stopTimers() {
  clearTimeout(quiet);
  clearTimeout(deadline);
  deadline = undefined;
}

function displayPath() {
  const label = el("filepath");
  label.textContent = path ?? folder;
  label.title = (path ?? folder) + "（点击打开所在目录）";
}

function saved(result: Saved) {
  path = result.path;
  displayPath();
  entries = [result.entry, ...entries.filter(item => item.id !== current)];
  list(entries, current);
}

async function write() {
  // 同一时刻仅允许一笔写入。等待磁盘时仍可输入，旧应答只确认它携带的版本。
  while (committed < revision) {
    const version = revision, text = body.value;
    status("正在保存", "dirty");
    const place = position();
    const result = await library.save({id:current, title:title.value, body:text, place});
    lastPlace = place;
    committed = version;
    saved(result);
    count(text);
  }
  status("已保存");
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
  quiet = window.setTimeout(autoSave, saveDelay());
  deadline ??= window.setTimeout(autoSave, Math.max(saveDelay(), 4000));
}
title.oninput = body.oninput = changed;
window.addEventListener("blur", () => { if (!busy) autoSave(); });

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
el("filepath").onclick = () => action(() => library.openLocation(current), false);
el("open-file").onclick = () => action(async () => {
  const desk = await library.open();
  if (desk) show(desk);
  body.focus();
});
el("save-file").onclick = () => action(async () => {
  if (revision === committed) revision++;
  await flush();
  body.focus();
}, false);
el("save-as").onclick = () => action(async () => {
  stopTimers();
  // 切换目标前先等在途写入结束；原路径报错时仍可将恢复稿另存到可用目录。
  if (pending) await flush();
  try {
    const place = position();
    const result = await library.saveAs({id:current, title:title.value, body:body.value, place}, revision !== committed);
    if (result) {
      committed = revision;
      lastPlace = place;
      saved(result);
      count(body.value);
      status("已保存");
      el("error").hidden = true;
    }
  } finally {
    if (revision !== committed) autoSave();
  }
  body.focus();
}, false);
el("remove").onclick = () => {
  if (!ready || busy) return;

  el("confirm-text").textContent = "“" + (title.value.trim() || body.value.slice(0, 32).trim() || untitled) + "” 将从稿本移除。已保存的 TXT 文件会保留。";
  confirm.returnValue = "cancel";
  confirm.showModal();
};
confirm.onclose = () => {
  if (confirm.returnValue === "delete") void action(async () => {
    show(await library.remove(current));
    body.focus();
  });
};

function isQuick() { return document.body.classList.contains("quick"); }
function quickLayout(on:boolean) {
  document.body.classList.toggle("quick",on);
  el("quick-toggle").textContent=on?"展开主窗口":"速记窗";
}
type Intent="quick"|"full"|"quit"|"hide";
function dispatch(intent:Intent) {
  // 所有隐藏和退出都走保存门槛，写盘失败时用户仍能看到错误并另存为。
  if(intent==="hide" || intent==="quit"){
    body.blur();title.blur();
    return action(()=>intent==="hide" ? desktop.hide() : desktop.destroy());
  }
  return action(async()=>{
    if(intent==="quick" && !confirm.open){
      el<HTMLDialogElement>("panel").close();
      resetFind();
    }
    const quick=intent==="quick";
    await standby.display(quick);
    quickLayout(quick);
    body.focus();
  },false);
}
el("quick-toggle").onclick=()=>dispatch(isQuick()?"full":"quick");
el("quick-new").onclick=()=>el("new").click();
el("stow").onclick=()=>dispatch("hide");
document.addEventListener("keydown", e => {
  const key=e.key.toLowerCase();
  if(key==="f5" || (e.ctrlKey && key==="r"))e.preventDefault();
  if(e.isComposing || !ready || confirm.open || el<HTMLDialogElement>("panel").open) return;
  if(key==="enter" && e.target===title){e.preventDefault();body.focus();}
  const command=localAction(e);
  if(command){
    e.preventDefault();
    if(e.repeat)return;
    if(command==="find" || command==="replace") openFind(command==="replace");
    else {
      const target={new:"new",open:"open-file",save:"save-file",saveAs:"save-as",settings:"options",focus:"focus",quick:"quick-toggle"}[command];
      el(target).click();
    }
  } else if(key==="escape" && isQuick()){e.preventDefault();void dispatch("hide");}
  else if(key==="escape" && document.body.classList.contains("focused"))setFocusMode(false);
});

async function boot() {
  try {
    show(await library.start());
    const prefs=await standby.read();
    initKeys(prefs.binding,prefs.autostart);
    quickLayout(prefs.compact);
    if(prefs.binding.issue)errorMessage(prefs.binding.issue);
    await desktop.listen<Intent>("standby-action", e=>{void dispatch(e.payload);});
    await desktop.onCloseRequested(async e => {
      e.preventDefault();
      await dispatch(el<HTMLInputElement>("resident").checked ? "hide":"quit");
    });
    title.disabled = body.disabled = false;
    ready = true;
    body.focus();
  } catch (error) {
    status("稿本未打开", "error");
    errorMessage(error, boot);
  }
}
settings(value => { folder = value; displayPath(); });
initFind();
void boot();
