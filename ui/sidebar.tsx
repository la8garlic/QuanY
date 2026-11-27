import { FileText, Pin, Plus, Search, Settings2, StickyNote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { library, type Entry, type SearchHit } from "./ipc";

const shortDate = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" });
const shortTime = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function modifiedLabel(stamp: number) {
  const time = new Date(stamp);
  return time.toDateString() === new Date().toDateString()
    ? "今天 · " + shortTime.format(time)
    : shortDate.format(time) + " · " + shortTime.format(time);
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
const collate = new Intl.Collator("zh-CN", { numeric: true });
export function Sidebar({ entries, current, tags, search, filter, onSearch, onFilter }: SidebarProps) {
  const [sort, setSort] = useState(() => localStorage.getItem("catalog-sort") || "recent");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  const term = search.trim();

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
    [entries, term, snippets, filter, sort],
  );
  return (
    <aside aria-label="稿本">
      <header className="brand">
        <span className="brand-stamp" aria-hidden="true">
          <i>&#xE70F;</i>
        </span>
        <strong>笺记</strong>
        <button id="new" aria-label="新建手稿" title="新建手稿">
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
          placeholder="搜索手稿"
          aria-label="搜索标题或正文"
        />
      </label>
      <div className="catalog-controls">
        <select
          aria-label="筛选稿本"
          id="catalog-filter"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
        >
          <option value="">全部手稿</option>
          <option value="pinned">已置顶</option>
          {tags.length > 0 && (
            <optgroup label="标签">
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
          aria-label="手稿排序"
          id="catalog-sort"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            localStorage.setItem("catalog-sort", e.target.value);
          }}
        >
          <option value="recent">最近编辑</option>
          <option value="oldest">最早编辑</option>
          <option value="title">按标题</option>
        </select>
      </div>
      <nav id="notes" aria-label="手稿列表">
        {term && error ? (
          <p role="alert">{error}</p>
        ) : (
          items.map((entry) => (
            <button
              key={entry.id}
              data-id={entry.id}
              onClick={async () => {
                const { openManuscript } = await import("./editor");
                await openManuscript(entry.id, term);
              }}
              title={entry.title || "未命名手稿"}
              aria-current={entry.id === current ? "page" : undefined}
            >
              {entry.pinned ? (
                <Pin className="note-symbol" aria-hidden="true" />
              ) : (
                <FileText className="note-symbol" aria-hidden="true" />
              )}
              <strong>{entry.title || "未命名手稿"}</strong>
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
        {!error && !items.length && <p>{filter === "pinned" ? "暂无置顶手稿" : "没有匹配的手稿"}</p>}
      </nav>
      <div className="side-tools">
        <button id="memos">
          <StickyNote aria-hidden="true" />
          独立便笺
        </button>
        <button id="options" aria-haspopup="dialog" title="设置" aria-label="设置">
          <Settings2 aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
