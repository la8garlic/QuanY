/** 固定模板中的控件在编译时约定类型，动态稿件标题始终作为文本显示。 */
export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const title = el<HTMLInputElement>("title");
export const body = el<HTMLTextAreaElement>("body");
export const search = el<HTMLInputElement>("search");
export const untitled = "未命名手稿";
const date = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
import { library, type Entry } from "./ipc.js";

let request=0,timer:number;
export function list(entries:Entry[],current:number) {
  const token=++request,term=search.value.trim();
  clearTimeout(timer);
  function paint(items:(Entry & {snippet?:string})[]){
    if(token!==request)return;
    const fragment=document.createDocumentFragment();
    for(const entry of items){
      const button=document.createElement("button"),name=entry.title.trim()||untitled;
      button.dataset.id=String(entry.id);button.title=name;
      if(entry.id===current)button.setAttribute("aria-current","page");
      const label=document.createElement("strong");label.textContent=name;
      const time=document.createElement("time");time.dateTime=new Date(entry.modified).toISOString();
      time.textContent=date.format(entry.modified)+" · "+clock.format(entry.modified);
      button.append(label,time);
      if(entry.snippet){const line=document.createElement("small");line.textContent=entry.snippet;button.append(line);}
      fragment.append(button);
    }
    if(!items.length){const empty=document.createElement("p");empty.textContent="没有匹配的手稿";fragment.append(empty);}
    el("notes").replaceChildren(fragment);
    el("total").textContent=String(items.length);
  }
  if(!term){paint(entries);return;}
  timer=window.setTimeout(()=>{void library.search(term).then(paint).catch(error=>{
    if(token===request)el("notes").textContent=String(error);
  });},140);
}

export function count(text: string) {
  // 按 Unicode 码点计数，换行和空白不计入正文字数。
  let n = 0;
  for (const ch of text) if (!/\s/u.test(ch)) n++;
  el("count").textContent = n.toLocaleString("zh-CN") + " 字";
}

export function status(text: string, state = "saved") {
  el("save").textContent = text;
  el("save").dataset.state = state;
}

export function setFocusMode(on: boolean) {
  document.body.classList.toggle("focused", on);
  el("focus").setAttribute("aria-pressed", String(on));
  el("focus").textContent = on ? "退出专注" : "专注";
  body.focus();
}

let directory = "";
export function setDirectory(value: string) {
  directory = value;
  el<HTMLInputElement>("folder").value = value;
}
export const saveDelay = () => Number(el<HTMLSelectElement>("delay").value);

export function settings(onDirectory: (value: string) => void) {
  const root = document.documentElement;
  const panel = el<HTMLDialogElement>("panel");
  const input = el<HTMLInputElement>("folder"), hint = el("folder-info");
  const note = hint.textContent;
  el("options").onclick = () => {
    input.value = directory;
    hint.textContent = note;
    panel.showModal();
  };
  async function updateFolder(pick: boolean) {
    const buttons = [el<HTMLButtonElement>("browse"), el<HTMLButtonElement>("apply-folder")];
    buttons.forEach(b => b.disabled = true);
    try {
      const value = await (pick ? library.chooseFolder() : library.setFolder(input.value.trim()));
      if (value !== null) { setDirectory(value); onDirectory(value); hint.textContent = "目录已保存，新稿将在此创建 TXT。"; }
    } catch (error) { hint.textContent = String(error); }
    finally { buttons.forEach(b => b.disabled = false); }
  }
  el("browse").onclick = () => updateFolder(true);
  el("apply-folder").onclick = () => updateFolder(false);
  input.onkeydown = e => { if (e.key === "Enter") el("apply-folder").click(); };
  for(const tab of document.querySelectorAll<HTMLButtonElement>("[data-page]")){
    tab.onclick=()=>{
      for(const button of document.querySelectorAll<HTMLButtonElement>("[data-page]"))button.setAttribute("aria-pressed",String(button===tab));
      for(const section of document.querySelectorAll<HTMLElement>("[data-settings]"))section.hidden=section.dataset.settings!==tab.dataset.page;
    };
  }
  const controls = ["font","theme","delay","leading","width"].map(id=>el<HTMLSelectElement>(id));
  for (const control of controls) {
    const value = localStorage.getItem(control.id);
    if (Array.from(control.options).some(o => o.value === value)) control.value = value!;
  }
  const wrap = el<HTMLInputElement>("wrap");
  wrap.checked = localStorage.getItem("wrap") !== "off";
  let size = Number(localStorage.getItem("size") ?? "20");
  if (!Number.isInteger(size) || size < 12 || size > 36) size = 20;
  function apply() {
    for (const control of controls) root.dataset[control.id] = control.value;
    root.style.setProperty("--leading", el<HTMLSelectElement>("leading").value);
    root.style.setProperty("--text-size", size + "px");
    body.wrap = wrap.checked ? "soft" : "off";
    el("size").textContent = String(size);
    el<HTMLButtonElement>("smaller").disabled = size <= 12;
    el<HTMLButtonElement>("larger").disabled = size >= 36;
  }
  function remember() {
    apply();
    for (const control of controls) localStorage.setItem(control.id,control.value);
    localStorage.setItem("wrap",wrap.checked ? "soft" : "off");
    localStorage.setItem("size",String(size));
  }
  el("smaller").onclick = () => { size -= 2; remember(); };
  el("larger").onclick = () => { size += 2; remember(); };
  for (const control of [...controls, wrap]) control.onchange = remember;
  el("focus").onclick = () => setFocusMode(!document.body.classList.contains("focused"));
  apply();
}
