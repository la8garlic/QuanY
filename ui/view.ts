import { locale, onLanguageChange, t, type Message } from "./i18n";
import { writing, mountWriting, wrapWriting } from "./writing";
import { characterCount } from "./statistics";
/** 固定模板中的控件在编译时约定类型，动态稿件标题始终作为文本显示。 */
export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const title = el<HTMLInputElement>("title");
mountWriting(el("body"));
export const untitled = () => t("未命名手稿");
import { library } from "./ipc.js";
let goal = 0;
export function setGoal(target:number) { goal = target; }
export function count(text: string) {
  const n = characterCount(text);
  el("count").textContent = n.toLocaleString(locale) + (goal ? " / " + goal.toLocaleString(locale) : "") + (locale === "zh-CN" ? " 字" : (goal || n) === 1 ? " character" : " characters");
  const bar = el<HTMLProgressElement>("goal-progress");
  bar.hidden = !goal;
  if (goal) { bar.max=goal; bar.value=n; }
}
let saveMessage: Message = "正在打开稿本";
export function status(text: Message, state = "saved") {
  saveMessage = text;
  el("save").textContent = t(text);
  el("save").dataset.state = state;
}

export function setFocusMode(on: boolean) {
  document.body.classList.toggle("focused", on);
  el("focus").setAttribute("aria-pressed", String(on));
  el("focus-label").textContent = t(on ? "退出专注" : "专注");
  writing.focus();
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
  const note = () => t("新稿首次保存时在此创建 TXT；已有文件继续保存到原位置。");
  const refresh = () => {
    hint.textContent = note();
    el("save").textContent = t(saveMessage);
    el("focus-label").textContent = t(document.body.classList.contains("focused") ? "退出专注" : "专注");
    count(writing.state.doc.toString());
  };
  refresh();
  onLanguageChange(refresh);
  el("options").onclick = () => {
    input.value = directory;
    hint.textContent = note();
    panel.showModal();
  };
  async function updateFolder(pick: boolean) {
    const buttons = [el<HTMLButtonElement>("browse"), el<HTMLButtonElement>("apply-folder")];
    buttons.forEach(b => b.disabled = true);
    try {
      const value = await (pick ? library.chooseFolder() : library.setFolder(input.value.trim()));
      if (value !== null) { setDirectory(value); onDirectory(value); hint.textContent = t("目录已保存，新稿将在此创建 TXT。"); }
    } catch (error) { hint.textContent = String(error); }
    finally { buttons.forEach(b => b.disabled = false); }
  }
  el("browse").onclick = () => updateFolder(true);
  el("apply-folder").onclick = () => updateFolder(false);
  input.onkeydown = e => { if (e.key === "Enter") el("apply-folder").click(); };
  const controls = ["font","delay"].map(id=>el<HTMLSelectElement>(id));
  for (const control of controls) {
    const value = localStorage.getItem(control.id);
    if (Array.from(control.options).some(o => o.value === value)) control.value = value!;
  }
  // 保留已保存的偏好键，原生单选框负责方向键导航。
  const choices = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  for (const choice of choices) {
    if (localStorage.getItem(choice.name) === choice.value) choice.checked = true;
  }
  const wrap = el<HTMLInputElement>("wrap");
  wrap.checked = localStorage.getItem("wrap") !== "off";
  let size = Number(localStorage.getItem("size") ?? "20");
  if (!Number.isInteger(size) || size < 12 || size > 36) size = 20;
  function apply() {
    for (const control of controls) root.dataset[control.id] = control.value;
    for (const choice of choices) {
      if (choice.checked) {
        root.dataset[choice.name] = choice.value;
        if (choice.name === "leading") root.style.setProperty("--leading", choice.value);
      }
    }
    root.style.setProperty("--text-size", size + "px");
    wrapWriting(wrap.checked);
    el("size").textContent = String(size);
    el<HTMLButtonElement>("smaller").disabled = size <= 12;
    el<HTMLButtonElement>("larger").disabled = size >= 36;
  }
  function remember() {
    apply();
    for (const control of controls) localStorage.setItem(control.id,control.value);
    for (const choice of choices) if (choice.checked) localStorage.setItem(choice.name, choice.value);
    localStorage.setItem("wrap",wrap.checked ? "soft" : "off");
    localStorage.setItem("size",String(size));
  }
  el("smaller").onclick = () => { size -= 2; remember(); };
  el("larger").onclick = () => { size += 2; remember(); };
  for (const control of [...controls, ...choices, wrap]) control.onchange = remember;
  el("focus").onclick = () => setFocusMode(!document.body.classList.contains("focused"));
  apply();
}
