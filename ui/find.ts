import { locale, onLanguageChange } from "./i18n";
/** 直接查找纯文本偏移量，替换通过编辑控件完成，可使用 Ctrl+Z 撤销。 */
import { body, el } from "./view.js";

const bar = el("findbar"), needle = el<HTMLInputElement>("needle");
const replacement = el<HTMLInputElement>("replacement");
// 稀疏记录匹配位置；跳转时只需在光标附近重走一小段，重叠词也与全部替换一致。
let anchors: number[] = [], count = 0, last = -1, timer: number | undefined;

function enable(enabled: boolean) {
  for (const id of ["prev","next","replace-one","replace-all"]) el<HTMLButtonElement>(id).disabled = !enabled;
}

function recount() {
  clearTimeout(timer);
  timer = undefined;
  anchors = [];
  count = 0;
  last = -1;
  const query = needle.value, text = body.value;
  if (query) {
    let pos = text.indexOf(query);
    let nextAnchor = 0;
    while (pos >= 0) {
      if (pos >= nextAnchor) { anchors.push(pos); nextAnchor = pos + 16384; }
      last = pos;
      count++;
      pos = text.indexOf(query, pos + query.length);
    }
  }
  el("matches").textContent = query ? count + (locale === "zh-CN" ? " 处" : count === 1 ? " match" : " matches") : "";
  enable(count > 0);
}

function schedule() {
  clearTimeout(timer);
  el("matches").textContent = needle.value ? "…" : "";
  enable(!!needle.value);
  timer = window.setTimeout(recount, 180);
}

function nearest(edge: number, back: boolean) {
  const text = body.value, query = needle.value;
  let low = 0, high = anchors.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (anchors[mid]! < edge) low = mid + 1; else high = mid;
  }
  let pos = anchors[Math.max(0, low - 1)]!, previous = last;
  while (pos >= 0 && pos < edge) {
    previous = pos;
    pos = text.indexOf(query, pos + query.length);
  }
  return back ? previous : pos >= 0 ? pos : anchors[0]!;
}

function move(back: boolean) {
  if (timer !== undefined) recount();
  if (!count) return;
  const at = nearest(back ? body.selectionStart : body.selectionEnd, back);
  body.focus();
  body.setSelectionRange(at, at + needle.value.length);
}

function replace(all: boolean) {
  if (timer !== undefined) recount();
  if (body.readOnly || !count) return;
  if (!all && (body.selectionEnd-body.selectionStart !== needle.value.length || nearest(body.selectionStart, false) !== body.selectionStart)) move(false);
  const value = all ? body.value.split(needle.value).join(replacement.value) : replacement.value;
  body.focus();
  if (all) body.select();
  if (value) document.execCommand("insertText",false,value);
  else document.execCommand("delete");
  if (!all) move(false);
}

export function resetFind() { clearTimeout(timer); timer = undefined; bar.hidden = true; anchors = []; }
export function openFind(forReplace: boolean) {
  const selected = body.value.slice(body.selectionStart, body.selectionEnd);
  if (selected && !selected.includes("\n")) needle.value = selected;
  bar.hidden = false;
  recount();
  const field = forReplace && needle.value ? replacement : needle;
  field.focus();
  field.select();
}
export function initFind() {
  el("find-open").onclick = () => openFind(false);
  el("find-close").onclick = () => { resetFind(); body.focus(); };
  el("next").onclick = () => move(false);
  el("prev").onclick = () => move(true);
  el("replace-one").onclick = () => replace(false);
  el("replace-all").onclick = () => replace(true);
  onLanguageChange(() => { if (!bar.hidden) recount(); });
  needle.oninput = schedule;
  body.addEventListener("input", () => { if (!bar.hidden) schedule(); });
  document.addEventListener("keydown", e => {
    if (bar.hidden || e.isComposing || document.querySelector("dialog[open]")) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); el("find-close").click(); }
    if (e.key === "F3" || (e.key === "Enter" && e.target === needle)) {
      e.preventDefault();
      move(e.shiftKey);
      if (e.target === needle) needle.focus();
    }
    if (e.key === "Enter" && e.target === replacement) { e.preventDefault(); replace(false); }
  }, true);
}
