/** 直接查找纯文本偏移量，替换通过编辑控件完成，可使用 Ctrl+Z 撤销。 */
import { body, el } from "./view.js";

const bar = el("findbar"), needle = el<HTMLInputElement>("needle");
const replacement = el<HTMLInputElement>("replacement");
let hits: number[] = [];

function recount() {
  hits = [];
  const query = needle.value, text = body.value;
  if (query) {
    let pos = text.indexOf(query);
    while (pos >= 0) { hits.push(pos); pos = text.indexOf(query, pos + query.length); }
  }
  el("matches").textContent = query ? hits.length + " 处" : "";
  for (const id of ["prev","next","replace-one","replace-all"]) el<HTMLButtonElement>(id).disabled = !hits.length;
}

function move(back: boolean) {
  if (!hits.length) return;
  const edge = back ? body.selectionStart : body.selectionEnd;
  let low = 0, high = hits.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (hits[mid]! < edge) low = mid + 1; else high = mid;
  }
  const at = hits[(low + hits.length - Number(back)) % hits.length]!;
  body.focus();
  body.setSelectionRange(at, at + needle.value.length);
}

function replace(all: boolean) {
  if (body.readOnly || !hits.length) return;
  if (!all && (body.selectionEnd-body.selectionStart !== needle.value.length || !hits.includes(body.selectionStart))) move(false);
  const value = all ? body.value.split(needle.value).join(replacement.value) : replacement.value;
  body.focus();
  if (all) body.select();
  if (value) document.execCommand("insertText",false,value);
  else document.execCommand("delete");
  if (!all) move(false);
}

export function resetFind() { bar.hidden = true; hits = []; }
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
  needle.oninput = recount;
  body.addEventListener("input", () => { if (!bar.hidden) recount(); });
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
