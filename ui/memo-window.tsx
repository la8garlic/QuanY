import { WindowControls } from "./window-controls";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
function MemoWindow() {
  useEffect(() => {
    void import("./memo");
  }, []);
  return (
    <>
      <header data-tauri-drag-region>
        <strong data-tauri-drag-region>置顶便笺</strong>
        <span role="status" id="memo-status" data-tauri-drag-region>
          正在打开
        </span>
        <button id="memo-remove" disabled>
          删除…
        </button>
        <WindowControls />
      </header>
      <textarea id="memo-text" aria-label="便笺正文" placeholder="写下提纲或随手记…" disabled></textarea>
      <dialog id="memo-confirm">
        <h2>删除这张便笺？</h2>
        <p>删除后无法恢复。</p>
        <form method="dialog">
          <button value="cancel" autoFocus>
            取消
          </button>
          <button value="delete" className="danger">
            删除便笺
          </button>
        </form>
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<MemoWindow />);
