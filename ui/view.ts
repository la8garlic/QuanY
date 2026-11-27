/** 固定模板中的控件在编译时约定类型，动态稿件标题始终作为文本显示。 */
export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const title = el<HTMLInputElement>("title");
export const body = el<HTMLTextAreaElement>("body");
export const search = el<HTMLInputElement>("search");
export const untitled = "未命名手稿";
const date = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
import type { Entry } from "./ipc.js";

export function list(entries: Entry[], current: number) {
  const fragment = document.createDocumentFragment();
  const term = search.value.trim().toLocaleLowerCase();
  for (const entry of entries) {
    const name = entry.title.trim() || untitled;
    if (!name.toLocaleLowerCase().includes(term)) continue;
    const button = document.createElement("button");
    button.dataset.id = String(entry.id);
    if (entry.id === current) button.setAttribute("aria-current", "page");
    const label = document.createElement("strong");
    label.textContent = name;
    const time = document.createElement("time");
    time.dateTime = new Date(entry.modified).toISOString();
    time.textContent = date.format(entry.modified) + " · " + clock.format(entry.modified);
    button.title = name;
    button.append(label, time);
    fragment.append(button);
  }
  if (!fragment.childElementCount) {
    const empty = document.createElement("p");
    empty.textContent = "没有匹配的手稿";
    fragment.append(empty);
  }
  el("notes").replaceChildren(fragment);
  el("total").textContent = String(entries.length);
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

export function settings() {
  const root = document.documentElement;
  const font = el<HTMLSelectElement>("font"), theme = el<HTMLSelectElement>("theme");
  const panel = el("panel"), options = el("options");
  function menu(open: boolean) {
    panel.hidden = !open;
    options.setAttribute("aria-expanded", String(open));
  }
  options.onclick = () => menu(panel.hidden);
  document.addEventListener("pointerdown", e => {
    if (e.target instanceof Node && !panel.contains(e.target) && !options.contains(e.target)) menu(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !panel.hidden) { menu(false); options.focus(); }
  });
  let size = Number(localStorage.getItem("size") ?? "20");
  if (!Number.isInteger(size) || size < 16 || size > 32) size = 20;
  font.value = localStorage.getItem("font") === "sans" ? "sans" : "serif";
  theme.value = localStorage.getItem("theme") === "night" ? "night" : "paper";
  function apply() {
    root.dataset.font = font.value;
    root.dataset.theme = theme.value;
    root.style.setProperty("--text-size", size + "px");
    el("size").textContent = String(size);
    el<HTMLButtonElement>("smaller").disabled = size <= 16;
    el<HTMLButtonElement>("larger").disabled = size >= 32;
  }
  function remember() {
    apply();
    localStorage.setItem("size", String(size));
    localStorage.setItem("font", font.value);
    localStorage.setItem("theme", theme.value);
  }
  el("smaller").onclick = () => { size -= 2; remember(); };
  el("larger").onclick = () => { size += 2; remember(); };
  font.onchange = theme.onchange = remember;
  el("focus").onclick = () => setFocusMode(!document.body.classList.contains("focused"));
  apply();
}
