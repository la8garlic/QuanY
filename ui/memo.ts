import { onLanguageChange, t, type Message } from "./i18n";
/** 每张便笺串行提交自己的正文；保存失败时仍可在窗口中继续编辑。 */
import { desktop, library } from "./ipc.js";
const text = document.querySelector<HTMLTextAreaElement>("#memo-text")!;
const status = document.querySelector<HTMLElement>("#memo-status")!;
const retry = document.querySelector<HTMLButtonElement>("#memo-retry")!;
let lastStatus: Message | null = "正在打开";
function setStatus(key: Message) { lastStatus = key; status.textContent = t(key); }
function showError(error: unknown) { lastStatus = null; status.textContent = String(error); }
onLanguageChange(() => { if (lastStatus) setStatus(lastStatus); });
setStatus("正在打开");
document.documentElement.dataset.theme = localStorage.getItem("theme") === "night" ? "night" : "paper";
let revision = 0,
  committed = 0,
  timer: number | undefined,
  pending: Promise<void> | undefined;
async function write() {
  while (committed !== revision) {
    const version = revision;
    await library.writeMemo(text.value);
    committed = version;
  }
  setStatus("已保存");
  retry.hidden = true;
}
async function flush() {
  clearTimeout(timer);
  timer = undefined;
  pending ??= write().finally(() => {
    pending = undefined;
  });
  try {
    await pending;
    return true;
  } catch (error) {
    showError(error);
    retry.hidden = false;
    return false;
  }
}
async function boot() {
  text.value = await library.readMemo();
  await desktop.onCloseRequested(async (event) => {
    event.preventDefault();
    text.readOnly = true;
    if (await flush()) await desktop.destroy();
    else text.readOnly = false;
  });
  const remove = document.querySelector<HTMLButtonElement>("#memo-remove")!;
  const confirm = document.querySelector<HTMLDialogElement>("#memo-confirm")!;
  remove.disabled = false;
  remove.onclick = () => {
    confirm.returnValue = "cancel";
    confirm.showModal();
  };
  confirm.onclose = async () => {
    if (confirm.returnValue !== "delete") return;
    text.readOnly = true;
    remove.disabled = true;
    clearTimeout(timer);
    try {
      if (pending) await pending;
      await library.deleteMemo();
      committed = revision;
      await desktop.destroy();
    } catch (error) {
      showError(error);
      text.readOnly = false;
      remove.disabled = false;
    }
  };
  text.disabled = false;
  retry.onclick = () => void flush();
  text.focus();
  setStatus("已保存");
  text.oninput = () => {
    revision++;
    setStatus("待保存");
    // 写盘失败也会消耗本轮定时器，下一次输入重新启动保存。
    timer ??= window.setTimeout(() => void flush(), 350);
  };
  window.onblur = () => {
    void flush();
  };
}
void boot().catch((error) => {
  showError(error);
});
