import { WindowControls } from "./window-controls";
import {
  ArchiveX,
  BookOpen,
  ChevronDown,
  Columns2,
  FilePenLine,
  FolderOpen,
  History,
  Maximize,
  PictureInPicture2,
  Save,
  FileOutput,
  Search,
  Tags,
  X,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import type { Entry } from "./ipc";
import { QuickSwitcher, DetailsDialog } from "./catalog-tools";
import { Sidebar } from "./sidebar";
import { Dialogs } from "./dialogs";
function WritingDesk({
  entry,
  openDetails,
  openSwitch,
}: {
  entry: Entry | undefined;
  openDetails: () => void;
  openSwitch: () => void;
}) {
  return (
    <main>
      <header className="bar" data-tauri-drag-region>
        <button id="quick-new">
          <FilePenLine aria-hidden="true" />
          新便笺
        </button>
        <details id="file-menu">
          <summary title="文件操作">
            <FolderOpen aria-hidden="true" />
            文件
            <ChevronDown className="chevron" aria-hidden="true" />
          </summary>
          <div>
            <button id="save-file">
              <Save />
              保存
              <kbd data-shortcut="save" />
            </button>
            <button id="open-file">
              <FolderOpen />
              打开 TXT…
              <kbd data-shortcut="open" />
            </button>
            <button id="save-as">
              <FileOutput />
              另存为…
              <kbd data-shortcut="saveAs" />
            </button>
            <button id="remove">
              <ArchiveX />
              移出稿本…
            </button>
          </div>
        </details>

        <button id="switch-open" className="switch-launch" onClick={openSwitch} title="快速切稿">
          <BookOpen aria-hidden="true" />
          快速切稿
        </button>
        <span className="spacer" data-tauri-drag-region />
        <div className="tool-group" role="group" aria-label="查阅工具">
          <button className="icon-tool" id="find-open" aria-label="查找">
            <Search aria-hidden="true" />
          </button>
          <button className="icon-tool" id="history-open" title="版本历史" aria-label="版本历史">
            <History aria-hidden="true" />
          </button>
          <button
            className="icon-tool"
            id="reference-open"
            aria-pressed="false"
            title="并排参考"
            aria-label="并排参考"
          >
            <Columns2 aria-hidden="true" />
          </button>
        </div>
        <button id="focus" aria-pressed="false">
          <Maximize aria-hidden="true" />
          <span id="focus-label">专注</span>
        </button>
        <button id="quick-toggle">
          <PictureInPicture2 aria-hidden="true" />
          <span id="quick-label">速记窗</span>
        </button>
        <button id="stow">收起</button>
        <WindowControls />
      </header>
      <section id="findbar" aria-label="正文查找与替换" hidden>
        <div>
          <input id="needle" aria-label="查找内容" placeholder="查找正文" />
          <output id="matches" aria-live="polite"></output>
          <button id="prev" title="上一个（Shift+Enter）">
            上一个
          </button>
          <button id="next" title="下一个（Enter）">
            下一个
          </button>
          <button id="find-close" aria-label="关闭查找">
            <X aria-hidden="true" />
          </button>
        </div>
        <div>
          <input id="replacement" aria-label="替换内容" placeholder="替换为" />
          <button id="replace-one">替换</button>
          <button id="replace-all">全部替换</button>
        </div>
      </section>
      <div id="error" role="alert" hidden>
        <span id="error-text"></span>
        <button id="retry">重试</button>
      </div>
      <div id="desk-pages">
        <article>
          <div className="dateline">
            <span aria-hidden="true"></span>
            <time id="modified"></time>
            <button
              id="details-open"
              title="编辑置顶、标签和写作目标"
              onClick={openDetails}
              disabled={!entry}
            >
              <Tags aria-hidden="true" />
              手稿详情
            </button>
          </div>
          <input id="title" aria-label="手稿标题" placeholder="未命名手稿" autoComplete="off" disabled />

          <textarea
            id="body"
            aria-label="正文"
            placeholder="在这里写下正文…"
            spellCheck={false}
            disabled
          ></textarea>
        </article>
        <section id="reference" hidden aria-label="只读参考稿">
          <header>
            <label htmlFor="ref-choice">参考稿</label>
            <button id="ref-close" aria-label="关闭参考稿">
              <X aria-hidden="true" />
            </button>
          </header>
          <select id="ref-choice" aria-label="选择参考稿"></select>
          <pre id="ref-body"></pre>
        </section>
      </div>
      <footer>
        <span id="save" role="status">
          正在打开稿本
        </span>
        <button id="filepath" aria-label="打开当前保存目录"></button>
        <button id="stats-open" onClick={openDetails} disabled={!entry} title="字数统计与写作目标">
          <span id="count">0 字</span>
          <progress id="goal-progress" aria-label="写作目标完成进度" hidden />
        </button>
      </footer>
    </main>
  );
}
function Workspace() {
  const [desk, setDesk] = useState<{ entries: Entry[]; current: number | null }>({
    entries: [],
    current: null,
  });
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<"details" | "switch" | null>(null);
  // 先完成窗口挂载再绑定原生编辑器，切换导航不会重建正文或中断输入法。
  useEffect(() => {
    void import("./editor").then(({ startEditor }) =>
      startEditor((entries, current, clear) => {
        setDesk({ entries, current });
        if (clear) {
          setSearch("");
          setFilter("");
        }
      }),
    );
  }, []);
  const tags = useMemo(
    () =>
      Array.from(new Set(desk.entries.flatMap((n) => n.tags))).sort((a, b) =>
        a.localeCompare(b, "zh-CN"),
      ),
    [desk.entries],
  );
  const entry = desk.entries.find((n) => n.id === desk.current);
  const activeFilter = filter.startsWith("tag:") && !tags.includes(filter.slice(4)) ? "" : filter;
  return (
    <>
      <Sidebar
        {...desk}
        tags={tags}
        search={search}
        filter={activeFilter}
        onSearch={setSearch}
        onFilter={setFilter}
      />
      <WritingDesk
        entry={entry}
        openDetails={() => setDialog("details")}
        openSwitch={() => setDialog("switch")}
      />
      {dialog === "details" && entry && (
        <DetailsDialog key={entry.id} entry={entry} tags={tags} close={() => setDialog(null)} />
      )}
      {dialog === "switch" && <QuickSwitcher entries={desk.entries} close={() => setDialog(null)} />}
      <Dialogs />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Workspace />);
