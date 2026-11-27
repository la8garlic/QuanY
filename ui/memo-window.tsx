import { t, useLanguage } from "./i18n";
import { WindowControls } from "./window-controls";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
function MemoWindow() {
  useLanguage();
  useEffect(() => {
    void import("./memo");
  }, []);
  return (
    <>
      <header data-tauri-drag-region>
        <strong data-tauri-drag-region>{t("置顶便笺")}</strong>
        <span role="status" id="memo-status" data-tauri-drag-region></span>
        <button id="memo-retry" hidden>{t("重试")}</button>
        <button id="memo-remove" disabled>
          {t("删除…")}
        </button>
        <WindowControls />
      </header>
      <textarea id="memo-text" aria-label={t("便笺正文")} placeholder={t("写下提纲或随手记…")} disabled></textarea>
      <dialog id="memo-confirm">
        <h2>{t("删除这张便笺？")}</h2>
        <p>{t("删除后无法恢复。")}</p>
        <form method="dialog">
          <button value="cancel" autoFocus>
            {t("取消")}
          </button>
          <button value="delete" className="danger">
            {t("删除便笺")}
          </button>
        </form>
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<MemoWindow />);
