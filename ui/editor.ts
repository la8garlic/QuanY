import { locale, onLanguageChange, t } from "./i18n";
import { initResearch } from "./research.js";
import { literalSearch } from "./search";
import { initKeys, localAction } from "./shortcuts.js";
import { desktop, standby, library, type Details, type Desk, type Entry, type Note, type Place, type Saved } from "./ipc.js";
import { initFind, openFind, resetFind } from "./find.js";
import { writing, loadWriting, selectText, lockWriting, onTextChange } from "./writing";
import { count, el, setGoal, setFocusMode, settings, setDirectory, saveDelay, status, title, untitled } from "./view.js";

let entries: Entry[] = [];
let current: number;
type Publish = (entries: Entry[], current: number, clearSearch: boolean) => void;
let publish: Publish;
let lastPlace: Place;
let revision = 0, committed = 0;
let pending: Promise<void> | undefined;
let quiet: number, deadline: number | undefined;
let ready = false, busy = false;
let path: string | null;
let savedTitle: string, savedBody: string, txtPending: boolean;
let folder: string;
const confirm = el<HTMLDialogElement>("confirm");

function errorMessage(error: unknown, retry?: () => void) {
  el("error-text").textContent = String(error);
  el("error").hidden = false;
  el("retry").dataset.retry = String(!!retry);
  el("retry").textContent = t(retry ? "重试" : "知道了");
  el("retry").onclick = () => { el("error").hidden = true; if (retry) retry(); else void drainShellFiles(); };
}

function open(note: Note, clearSearch = false) {
  current = note.id;
  title.value = note.title;
  lastPlace = note.place;
  loadWriting(note.body, lastPlace);
  path = note.path;
  savedTitle = note.title;
  savedBody = note.body;
  txtPending = note.pending;
  committed = 0;
  revision = note.pending ? 1 : 0;
  displayPath();
  resetFind();
  el("error").hidden = true;
  setGoal(entries.find(entry=>entry.id===current)!.goal);
  count();
  setModified(note.modified);
  updateReference();
  status(note.pending ? "TXT 待写入" : path ? "已保存" : "本地草稿", note.pending ? "dirty" : "saved");
  if (note.notice) { status("本地恢复稿"); errorMessage(note.notice); }
  publish(entries, current, clearSearch);
}

function show(desk: Desk) {
  folder = desk.folder;
  setDirectory(folder);
  entries = desk.entries;
  open(desk.note, true);
}

function stopTimers() {
  clearTimeout(quiet);
  clearTimeout(deadline);
  deadline = undefined;
}

function setModified(value:number) {
  el("modified").textContent=new Date(value).toLocaleDateString(locale,{year:"numeric",month:"long",day:"numeric",weekday:"long"});
}
function displayPath() {
  const label = el("filepath");
  label.textContent = path ?? folder;
  label.title = (path ?? folder) + t("（点击打开所在目录）");
}

function saved(result: Saved) {
  setModified(result.entry.modified);
  path = result.path;
  displayPath();
  entries = [result.entry, ...entries.filter(item => item.id !== current)];
  publish(entries, current, false);
}

async function write() {
  // 同一时刻仅允许一笔写入。等待磁盘时仍可输入，旧应答只确认它携带的版本。
  while (committed < revision) {
    const version = revision, text = writing.state.doc.toString(), name = title.value;
    // 撤销回上次保存的内容时也跳过写盘；失败的写入仍需清理待写记录。
    if (path && !txtPending && text === savedBody && name === savedTitle) {
      committed = version;
      continue;
    }
    status("正在保存", "dirty");
    const place = position();
    txtPending = true;
    const result = await library.save({id:current, title:name, body:text, place});
    txtPending = false;
    savedTitle = name;
    savedBody = text;
    lastPlace = place;
    committed = version;
    saved(result);
  }
  status("已保存");
}

function position(): Place {
  return { start: writing.state.selection.main.from, end: writing.state.selection.main.to, top: writing.scrollDOM.scrollTop };
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
  if (composing) return;
  void flush().then(saved => { if (saved) void drainShellFiles(); });
}

function scheduleSave() {
  clearTimeout(quiet);
  quiet = window.setTimeout(autoSave, saveDelay());
  deadline ??= window.setTimeout(autoSave, Math.max(saveDelay(), 4000));
}
function changed() {
  revision++;
  status("等待保存", "dirty");
  scheduleSave();
}
title.oninput = changed;
onTextChange(() => {
  changed();
  count();
});
window.addEventListener("blur", () => { if (!busy) autoSave(); });

async function action(task: () => Promise<void>, saveFirst = true) {
  if (busy || !ready) return;
  busy = true;
  title.readOnly = true;
  lockWriting(true);
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
    return true;
  } catch (error) {
    el("error").dataset.kind = "action";
    errorMessage(error);
  } finally {
    title.readOnly = busy = false;
    lockWriting(false);
    void drainShellFiles();
  }
}

let shellPending = false, draining = false, composing = false;
// An Explorer launch may arrive during IME input, a modal dialog, or an in-flight save.
async function drainShellFiles() {
  if (!shellPending || !ready || busy || draining || composing || document.querySelector("dialog[open]")) return;
  draining = true;
  shellPending = false;
  const opened = await action(async () => {
    await standby.display(false);
    quickLayout(false);
    let desk: Desk | null;
    while ((desk = await library.openNextTxt()) !== null) show(desk);
    writing.focus();
  });
  draining = false;
  if (!opened) { shellPending = true; return; }
  if (shellPending) void drainShellFiles();
}
function requestShellOpen() { shellPending = true; void drainShellFiles(); }
document.addEventListener("compositionstart", () => { composing = true; });
document.addEventListener("compositionend", () => {
  composing = false;
  if (revision !== committed) { stopTimers(); scheduleSave(); }
  setTimeout(drainShellFiles, 0);
});
document.addEventListener("close", () => { queueMicrotask(drainShellFiles); }, true);

export function createManuscript(name: string) {
  return action(async () => {
    show(await library.create(name, ""));
    writing.focus();
  });
}
el("new").onclick = () => createManuscript("");

export function openManuscript(id: number, term = "") {
  return action(async () => {
    if (id !== current) open(await library.select(id));
    writing.focus();
    if (term) {
      const match = literalSearch(term).exec(writing.state.doc.toString());
      if (match) selectText(match.index, match.index + match[0].length);
    }
  });
}

export function editDetails(id:number, details:Details) {
  return action(async()=>{
    const entry=await library.setDetails(id,details);
    entries=entries.map(item=>item.id===id?entry:item);
    setGoal(entry.goal);
    count();
    publish(entries,current,false);
  });
}

el("filepath").onclick = () => action(() => library.openLocation(current), false);
el("open-file").onclick = () => action(async () => {
  const desk = await library.open();
  if (desk) show(desk);
  writing.focus();
});
el("save-file").onclick = () => action(async () => {
  if (!path && revision === committed) revision++;
  await flush();
  writing.focus();
}, false);
el("save-as").onclick = () => action(async () => {
  stopTimers();
  // 切换目标前先等在途写入结束；原路径报错时仍可将恢复稿另存到可用目录。
  if (pending) await flush();
  try {
    const place = position();
    const dirty = revision !== committed;
    if (dirty) txtPending = true; // 打开选择器前，后端会先提交恢复稿。
    const result = await library.saveAs({id:current, title:title.value, body:writing.state.doc.toString(), place}, dirty);
    if (result) {
      txtPending = false;
      savedTitle = title.value;
      savedBody = writing.state.doc.toString();
      committed = revision;
      lastPlace = place;
      saved(result);
      count();
      status("已保存");
      el("error").hidden = true;
    }
  } finally {
    if (revision !== committed) autoSave();
  }
  writing.focus();
}, false);
el("remove").onclick = () => {
  if (!ready || busy) return;

  el("confirm-text").textContent = t("“{title}” 将从稿本移除。已保存的 TXT 文件会保留。").replace("{title}", () => title.value.trim() || writing.state.doc.sliceString(0, 32).trim() || untitled());
  confirm.returnValue = "cancel";
  confirm.showModal();
};
confirm.onclose = () => {
  if (confirm.returnValue === "delete") void action(async () => {
    show(await library.remove(current));
    writing.focus();
  });
};

function isQuick() { return document.body.classList.contains("quick"); }
function quickLayout(on:boolean) {
  document.body.classList.toggle("quick",on);
  el("quick-label").textContent=t(on ? "展开主窗口" : "速记窗");
}
type Intent="quick"|"full"|"quit"|"hide";
function dispatch(intent:Intent) {
  // 所有隐藏和退出都走保存门槛，写盘失败时用户仍能看到错误并另存为。
  if(intent==="hide" || intent==="quit"){
    writing.contentDOM.blur();title.blur();
    return action(async()=>{if(intent==="hide")await desktop.hide();else{await library.closeMemos();await desktop.destroy();}});
  }
  return action(async()=>{
    if(intent==="quick" && !confirm.open){
      for(const dialog of document.querySelectorAll<HTMLDialogElement>("dialog[open]"))dialog.close();
      resetFind();
    }
    const quick=intent==="quick";
    await standby.display(quick);
    quickLayout(quick);
    writing.focus();
  },false);
}
el("quick-toggle").onclick=()=>dispatch(isQuick()?"full":"quick");
el("quick-new").onclick=()=>el("new").click();
el("stow").onclick=()=>dispatch("hide");
document.addEventListener("keydown", e => {
  const key=e.key.toLowerCase();
  if(key==="f5" || (e.ctrlKey && key==="r"))e.preventDefault();
  if(e.isComposing || !ready || document.querySelector("dialog[open]")) return;
  if(key==="enter" && e.target===title){e.preventDefault();writing.focus();}
  const command=localAction(e);
  if(command){
    e.preventDefault();
    if(e.repeat)return;
    if(command==="find" || command==="replace") openFind(command==="replace");
    else {
      const target={new:"new",open:"open-file",save:"save-file",saveAs:"save-as",settings:"options",focus:"focus",quick:"quick-toggle",switcher:"switch-open"}[command];
      el(target).click();
    }
  } else if(key==="escape" && isQuick()){e.preventDefault();void dispatch("hide");}
  else if(key==="escape" && document.body.classList.contains("focused"))setFocusMode(false);
});

async function boot() {
  try {
    await standby.setLanguage(locale === "en");
    show(await library.start());
    const prefs=await standby.read();
    initKeys(prefs.bindings,prefs.autostart);
    quickLayout(prefs.compact);
    for(const b of Object.values(prefs.bindings))if(b.issue)errorMessage(b.issue);
    await desktop.listen<Intent | "open-files">("standby-action", e => {
      if (e.payload === "open-files") requestShellOpen();
      else void dispatch(e.payload);
    });
    await desktop.onCloseRequested(async e => {
      e.preventDefault();
      await dispatch(el<HTMLInputElement>("resident").checked ? "hide":"quit");
    });
    title.disabled = false;
    lockWriting(false);
    ready = true;
    writing.focus();
    if (await library.hasShellFiles() || shellPending) requestShellOpen();
    void standby.registerTxt().catch(e => errorMessage(e));
  } catch (error) {
    status("稿本未打开", "error");
    errorMessage(error, boot);
  }
}
const fileMenu=el<HTMLDetailsElement>("file-menu");
fileMenu.addEventListener("click",e=>{if((e.target as Element).closest("button"))fileMenu.open=false;});
document.addEventListener("pointerdown",e=>{if(!fileMenu.contains(e.target as Node))fileMenu.open=false;});
const updateReference=initResearch(()=>current,()=>entries,action,async version=>{
  title.value=version.title;
  writing.dispatch({changes: {from: 0, to: writing.state.doc.length, insert: version.body}, selection: {anchor: 0}});
  changed();await flush();writing.focus();
},e=>errorMessage(e));
settings(value => { folder = value; displayPath(); });
initFind();
export function startEditor(onLibraryChange: Publish) {
  publish = onLibraryChange;
  onLanguageChange(() => {
    if (!ready) return;
    quickLayout(isQuick());
    displayPath();
    setModified(entries.find(entry => entry.id === current)!.modified);
    el("retry").textContent = t(el("retry").dataset.retry === "true" ? "重试" : "知道了");
    updateReference();
  });
  void boot();
}
