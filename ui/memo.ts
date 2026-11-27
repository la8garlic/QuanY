/** 每张便笺串行提交自己的正文；保存失败时仍可在窗口中继续编辑。 */
import { desktop, library } from "./ipc.js";
const text = document.querySelector<HTMLTextAreaElement>("#memo-text")!;
const status = document.querySelector<HTMLElement>("#memo-status")!;
document.documentElement.dataset.theme = localStorage.getItem("theme") === "night" ? "night" : "paper";
let revision = 0,
  committed = 0,
  timer: number,
  pending: Promise<void> | undefined;
async function write() {
  while (committed !== revision) {
    const version = revision;
    await library.writeMemo(text.value);
    committed = version;
  }
  status.textContent = "已保存";
}
async function flush() {
  clearTimeout(timer);
  pending ??= write().finally(() => {
    pending = undefined;
  });
  try {
    await pending;
    return true;
  } catch (error) {
    status.textContent = String(error);
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
      status.textContent = String(error);
      text.readOnly = false;
      remove.disabled = false;
    }
  };
  text.disabled = false;
  text.focus();
  status.textContent = "已保存";
  text.oninput = () => {
    revision++;
    status.textContent = "待保存";
    if (revision === committed + 1) timer = window.setTimeout(() => void flush(), 350);
  };
  window.onblur = () => {
    void flush();
  };
}
void boot().catch((error) => {
  status.textContent = String(error);
});
