import { locale, onLanguageChange } from "./i18n";
/** 直接查找纯文本偏移量，替换通过编辑控件完成，可使用 Ctrl+Z 撤销。 */
import { writing, selectText, onTextChange } from "./writing";
import { el } from "./view.js";
import { LiteralIndex } from "./literal-index";

const bar = el("findbar"), needle = el<HTMLInputElement>("needle");
const replacement = el<HTMLInputElement>("replacement");
let index: LiteralIndex | undefined, count = 0, timer: number | undefined;

function enable(enabled: boolean) {
  for (const id of ["prev","next","replace-one","replace-all"]) el<HTMLButtonElement>(id).disabled = !enabled;
}

function recount() {
  clearTimeout(timer);
  timer = undefined;
  const query = needle.value;
  if (query !== index?.query) index = query ? new LiteralIndex(query) : undefined;
  count = index ? index.count(writing.state.doc) : 0;
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
  return index!.nearest(writing.state.doc, edge, back);
}

function move(back: boolean) {
  if (timer !== undefined) recount();
  if (!count) return;
  const at = nearest(back ? writing.state.selection.main.from : writing.state.selection.main.to, back);
  writing.focus();
  selectText(at, at + needle.value.length);
}

function replace(all: boolean) {
  if (timer !== undefined) recount();
  if (writing.state.readOnly || !count) return;
  if (!all && (writing.state.selection.main.to-writing.state.selection.main.from !== needle.value.length || nearest(writing.state.selection.main.from, false) !== writing.state.selection.main.from)) move(false);
  const {doc, selection} = writing.state;
  const {from, to} = selection.main;
  const insert = all ? doc.toString().split(needle.value).join(replacement.value) : replacement.value;
  writing.focus();
  writing.dispatch({changes: {from: all ? 0 : from, to: all ? doc.length : to, insert},
    selection: {anchor: (all ? 0 : from) + insert.length}, userEvent: "input.replace"});
  if (!all) move(false);
}

export function resetFind() { clearTimeout(timer); timer = undefined; bar.hidden = true; index = undefined; }
export function openFind(forReplace: boolean) {
  const { doc, selection } = writing.state;
  const { from, to } = selection.main;
  if (from < to && to <= doc.lineAt(from).to) needle.value = doc.sliceString(from, to);
  bar.hidden = false;
  recount();
  const field = forReplace && needle.value ? replacement : needle;
  field.focus();
  field.select();
}
export function initFind() {
  el("find-open").onclick = () => openFind(false);
  el("find-close").onclick = () => { resetFind(); writing.focus(); };
  el("next").onclick = () => move(false);
  el("prev").onclick = () => move(true);
  el("replace-one").onclick = () => replace(false);
  el("replace-all").onclick = () => replace(true);
  onLanguageChange(() => { if (!bar.hidden) recount(); });
  needle.oninput = schedule;
  onTextChange( () => { if (!bar.hidden) schedule(); });
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
