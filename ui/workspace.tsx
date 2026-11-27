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
      <header className="bar">
        <button id="quick-new">新便笺</button>
        <details id="file-menu">
          <summary title="文件操作">
            <i aria-hidden="true">&#xE8B7;</i> 文件 <span aria-hidden="true">⌄</span>
          </summary>
          <div>
            <button id="save-file">保存</button>
            <button id="open-file">打开 TXT…</button>
            <button id="save-as">另存为…</button>
            <button id="remove">移出稿本…</button>
          </div>
        </details>

        <button id="switch-open" className="switch-launch" onClick={openSwitch} title="快速切稿">
          <i aria-hidden="true">&#xE8FD;</i> 快速切稿
        </button>
        <span className="spacer"></span>
        <button className="icon-tool" id="find-open" aria-label="查找">
          <i aria-hidden="true">&#xE721;</i>
        </button>
        <button className="icon-tool" id="history-open" title="版本历史" aria-label="版本历史">
          <i aria-hidden="true">&#xE81C;</i>
        </button>
        <button className="icon-tool" id="reference-open" title="并排参考" aria-label="并排参考">
          <i aria-hidden="true">&#xE8A9;</i>
        </button>
        <button id="focus" aria-pressed="false">
          专注
        </button>
        <button id="quick-toggle">速记窗</button>
        <button id="stow">收起</button>
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
            ×
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
              <i aria-hidden="true">&#xE8EC;</i> 手稿详情
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
              ×
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
