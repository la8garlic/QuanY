import { locale, t, useLanguage } from "./i18n";
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
          {t("新便笺")}
        </button>
        <details id="file-menu">
          <summary title={t("文件操作")}>
            <FolderOpen aria-hidden="true" />
            {t("文件")}
            <ChevronDown className="chevron" aria-hidden="true" />
          </summary>
          <div>
            <button id="save-file">
              <Save />
              {t("保存")}
              <kbd data-shortcut="save" />
            </button>
            <button id="open-file">
              <FolderOpen />
              {t("打开 TXT…")}
              <kbd data-shortcut="open" />
            </button>
            <button id="save-as">
              <FileOutput />
              {t("另存为…")}
              <kbd data-shortcut="saveAs" />
            </button>
            <button id="remove">
              <ArchiveX />
              {t("移出稿本…")}
            </button>
          </div>
        </details>

        <button id="switch-open" className="switch-launch" onClick={openSwitch} title={t("快速切稿")}>
          <BookOpen aria-hidden="true" />
          {t("快速切稿")}
        </button>
        <span className="spacer" data-tauri-drag-region />
        <div className="tool-group" role="group" aria-label={t("查阅工具")}>
          <button className="icon-tool" id="find-open" aria-label={t("查找")}>
            <Search aria-hidden="true" />
          </button>
          <button className="icon-tool" id="history-open" title={t("版本历史")} aria-label={t("版本历史")}>
            <History aria-hidden="true" />
          </button>
          <button
            className="icon-tool"
            id="reference-open"
            aria-pressed="false"
            title={t("并排参考")}
            aria-label={t("并排参考")}
          >
            <Columns2 aria-hidden="true" />
          </button>
        </div>
        <button id="focus" aria-pressed="false">
          <Maximize aria-hidden="true" />
          <span id="focus-label"></span>
        </button>
        <button id="quick-toggle">
          <PictureInPicture2 aria-hidden="true" />
          <span id="quick-label"></span>
        </button>
        <button id="stow">{t("收起")}</button>
        <WindowControls />
      </header>
      <section id="findbar" aria-label={t("正文查找与替换")} hidden>
        <div>
          <input id="needle" aria-label={t("查找内容")} placeholder={t("查找正文")} />
          <output id="matches" aria-live="polite"></output>
          <button id="prev" title={t("上一个（Shift+Enter）")}>
            {t("上一个")}
          </button>
          <button id="next" title={t("下一个（Enter）")}>
            {t("下一个")}
          </button>
          <button id="find-close" aria-label={t("关闭查找")}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div>
          <input id="replacement" aria-label={t("替换内容")} placeholder={t("替换为")} />
          <button id="replace-one">{t("替换")}</button>
          <button id="replace-all">{t("全部替换")}</button>
        </div>
      </section>
      <div id="error" role="alert" hidden>
        <span id="error-text"></span>
        <button id="retry"></button>
      </div>
      <div id="desk-pages">
        <article>
          <div className="dateline">
            <span aria-hidden="true"></span>
            <time id="modified"></time>
            <button
              id="details-open"
              title={t("编辑置顶、标签和写作目标")}
              onClick={openDetails}
              disabled={!entry}
            >
              <Tags aria-hidden="true" />
              {t("手稿详情")}
            </button>
          </div>
          <input id="title" aria-label={t("手稿标题")} placeholder={t("未命名手稿")} autoComplete="off" disabled />

          <div id="body"></div>
        </article>
        <section id="reference" hidden aria-label={t("只读参考稿")}>
          <header>
            <label htmlFor="ref-choice">{t("参考稿")}</label>
            <button id="ref-close" aria-label={t("关闭参考稿")}>
              <X aria-hidden="true" />
            </button>
          </header>
          <select id="ref-choice" aria-label={t("选择参考稿")}></select>
          <pre id="ref-body"></pre>
        </section>
      </div>
      <footer>
        <span id="save" role="status"></span>
        <button id="filepath" aria-label={t("打开当前保存目录")}></button>
        <button id="stats-open" onClick={openDetails} disabled={!entry} title={t("字数统计与写作目标")}>
          <span id="count"></span>
          <progress id="goal-progress" aria-label={t("写作目标完成进度")} hidden />
        </button>
      </footer>
    </main>
  );
}
function Workspace() {
  const language = useLanguage();
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
        a.localeCompare(b, locale),
      ),
    [desk.entries, language],
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
