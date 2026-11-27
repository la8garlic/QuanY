import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { history, historyKeymap, insertNewline, standardKeymap } from "@codemirror/commands";
import { drawSelection, EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";
import { onLanguageChange, t } from "./i18n";
import type { Place } from "./ipc";

// 文档和选区使用全文 UTF-16 偏移；DOM 只承载视口附近的行。
export let writing: EditorView;
const wrapping = new Compartment(), access = new Compartment(), labels = new Compartment();
const subscribers = new Set<(update: ViewUpdate) => void>();
let wrapped = true, locked = true;
const accessRules = () => [EditorState.readOnly.of(locked), EditorView.editable.of(!locked)];
const language = () => [placeholder(t("在这里写下正文…")),
  EditorView.contentAttributes.of({ "aria-label": t("正文"), spellcheck: "false" })];
const keys = keymap.of([{ key: "Enter", run: insertNewline, shift: insertNewline }, ...historyKeymap, ...standardKeymap]);

function state(doc: string, start: number, end: number) {
  return EditorState.create({doc,
    selection: EditorSelection.single(Math.min(doc.length, start), Math.min(doc.length, end)),
    extensions: [keys, history(), drawSelection(), labels.of(language()), access.of(accessRules()),
      wrapping.of(wrapped ? EditorView.lineWrapping : []),
      EditorView.updateListener.of(update => {
        if (update.docChanged) for (const callback of subscribers) callback(update);
      })],
  });
}

export function mountWriting(parent: HTMLElement) {
  writing = new EditorView({parent, state: state("", 0, 0)});
  onLanguageChange(() => writing.dispatch({effects: labels.reconfigure(language())}));
}
export function onTextChange(callback: (update: ViewUpdate) => void) { subscribers.add(callback); }
export function loadWriting(text: string, place: Place) {
  // 切稿重置该窗口的撤销历史，避免撤销进入上一份手稿。
  writing.setState(state(text, place.start, place.end));
  writing.scrollDOM.scrollTop = place.top;
}
export function selectText(from: number, to: number) {
  writing.dispatch({selection: {anchor: from, head: to}, scrollIntoView: true});
}
export function lockWriting(value: boolean) {
  if (locked === value) return;
  locked = value;
  writing.dispatch({effects: access.reconfigure(accessRules())});
}
export function wrapWriting(value: boolean) {
  if (wrapped === value) return;
  wrapped = value;
  writing.dispatch({effects: wrapping.reconfigure(value ? EditorView.lineWrapping : [])});
}
