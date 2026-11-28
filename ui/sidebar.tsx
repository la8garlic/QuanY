import { locale, t } from "./i18n";
import { ArchiveX, FileText, Pin, Plus, Search, Settings2, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { library, type Entry, type SearchHit } from "./ipc";

function dateLabel(language: string) {
  const date = new Intl.DateTimeFormat(language, { month: "long", day: "numeric" });
  const time = new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", hour12: false });
  return (stamp: number) => {
    const modified = new Date(stamp);
    const day = modified.toDateString() === new Date().toDateString() ? t("今天") : date.format(modified);
    return day + " · " + time.format(modified);
  };
}

interface SidebarProps {
  entries: Entry[];
  current: number | null;
  tags: string[];
  search: string;
  filter: string;
  onSearch: (s: string) => void;
  onFilter: (s: string) => void;
}

export function Sidebar({ entries, current, tags, search, filter, onSearch, onFilter }: SidebarProps) {
  const modifiedLabel = useMemo(() => dateLabel(locale), [locale]);
  const collate = useMemo(() => new Intl.Collator(locale, { numeric: true }), [locale]);
  const [sort, setSort] = useState(() => localStorage.getItem("catalog-sort") || "recent");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  const term = search.trim();
  const menu = useRef<HTMLDivElement>(null);
  const menuTarget = useRef<HTMLButtonElement>(null);
  function showMenu(row: HTMLButtonElement, x: number, y: number) {
    const popup = menu.current!;
    menuTarget.current = row;
    popup.showPopover();
    popup.style.left = Math.max(4, Math.min(x, innerWidth - popup.offsetWidth - 4)) + "px";
    popup.style.top = Math.max(4, Math.min(y, innerHeight - popup.offsetHeight - 4)) + "px";
    popup.querySelector("button")!.focus();
  }
  async function choose(kind: "hide" | "delete") {
    // 在菜单关闭前固定右击的行；当前打开的手稿可能是另一篇。
    const id = Number(menuTarget.current!.dataset.id);
    menu.current!.hidePopover();
    const { removeManuscript } = await import("./editor");
    await removeManuscript(id, kind);
  }

  useEffect(() => {
    if (!term) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const results = await library.search(term);
        if (active) {
          setHits(results);
          setError("");
        }
      } catch (reason) {
        if (active) setError(String(reason));
      }
    }, 140);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, entries]);

  const snippets = useMemo(() => new Map(hits.map((h) => [h.id, h.snippet])), [hits]);
  const items = useMemo(
    () =>
      entries
        .filter(
          (n) =>
            (!term || snippets.has(n.id)) &&
            (!filter || (filter === "pinned" ? n.pinned : n.tags.includes(filter.slice(4)))),
        )
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            (sort === "title"
              ? collate.compare(a.title, b.title)
              : sort === "oldest"
                ? a.modified - b.modified
                : b.modified - a.modified) ||
            b.id - a.id,
        ),
    [entries, term, snippets, filter, sort, collate],
  );
  return (
    <aside aria-label={t("稿本")}>
      <header className="brand" data-tauri-drag-region>
        <img className="brand-stamp" alt="" draggable={false} src={new URL("../assets/quany-mark.png", import.meta.url).href} />
        <strong data-tauri-drag-region>{t("泉涌")}</strong>
        <button id="new" aria-label={t("新建手稿")} title={t("新建手稿")}>
          <Plus aria-hidden="true" />
        </button>
      </header>
      <label className="library-search">
        <Search aria-hidden="true" />
        <input
          id="search"
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("搜索手稿")}
          aria-label={t("搜索标题或正文")}
        />
      </label>
      <div className="catalog-controls">
        <select
          aria-label={t("筛选稿本")}
          id="catalog-filter"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
        >
          <option value="">{t("全部手稿")}</option>
          <option value="pinned">{t("已置顶")}</option>
          {tags.length > 0 && (
            <optgroup label={t("标签")}>
              {tags.map((t) => (
                <option key={t} value={"tag:" + t}>
                  {t}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span id="total">{items.length}</span>
        <select
          aria-label={t("手稿排序")}
          id="catalog-sort"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            localStorage.setItem("catalog-sort", e.target.value);
          }}
        >
          <option value="recent">{t("最近编辑")}</option>
          <option value="oldest">{t("最早编辑")}</option>
          <option value="title">{t("按标题")}</option>
        </select>
      </div>
      <nav id="notes" aria-label={t("手稿列表")}>
        {term && error ? (
          <p role="alert">{error}</p>
        ) : (
          items.map((entry) => (
            <button
              key={entry.id}
              data-id={entry.id}
              aria-haspopup="menu"
              onContextMenu={e => {
                e.preventDefault();
                showMenu(e.currentTarget, e.clientX, e.clientY);
              }}
              onKeyDown={e => {
                if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  showMenu(e.currentTarget, rect.left + 10, rect.bottom);
                }
              }}
              onClick={async () => {
                const { openManuscript } = await import("./editor");
                await openManuscript(entry.id, term);
              }}
              title={entry.title || t("未命名手稿")}
              aria-current={entry.id === current ? "page" : undefined}
            >
              {entry.pinned ? (
                <Pin className="note-symbol" aria-hidden="true" />
              ) : (
                <FileText className="note-symbol" aria-hidden="true" />
              )}
              <strong>{entry.title || t("未命名手稿")}</strong>
              <time dateTime={new Date(entry.modified).toISOString()}>
                {modifiedLabel(entry.modified)}
              </time>
              {term ? (
                <small>{snippets.get(entry.id)}</small>
              ) : (
                entry.tags.length > 0 && (
                  <span className="note-tags">
                    {entry.tags.slice(0, 2).map((t) => (
                      <em key={t}>{t}</em>
                    ))}
                  </span>
                )
              )}
            </button>
          ))
        )}
        {!error && !items.length && <p>{filter === "pinned" ? t("暂无置顶手稿") : t("没有匹配的手稿")}</p>}
      </nav>
      <div className="note-menu" ref={menu} popover="auto" role="menu" aria-label={t("手稿操作")}
        onKeyDown={e => {
          if (e.key === "Escape" || e.key === "Tab") {
            menu.current!.hidePopover();
            menuTarget.current!.focus();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            const buttons = e.currentTarget.querySelectorAll("button");
            buttons[document.activeElement === buttons[0] ? 1 : 0]!.focus();
          } else return;
          if (e.key !== "Tab") e.preventDefault();
          e.stopPropagation();
        }}>
        <button role="menuitem" onClick={() => void choose("hide")}><ArchiveX />{t("移出稿本…")}</button>
        <button role="menuitem" className="danger" onClick={() => void choose("delete")}><Trash2 />{t("永久删除…")}</button>
      </div>
      <div className="side-tools">
        <button id="memos">
          <StickyNote aria-hidden="true" />
          {t("独立便笺")}
        </button>
        <button id="options" aria-haspopup="dialog" title={t("设置")} aria-label={t("设置")}>
          <Settings2 aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
