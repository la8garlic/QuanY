import { useEffect, useState } from "react";
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

export function Sidebar() {
  const [desk, setDesk] = useState<{ entries: Entry[]; current: number | null }>({
    entries: [],
    current: null,
  });
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  const term = search.trim();

  // 等 React 挂载输入框后再绑定原生编辑事件，输入法和撤销栈共享同一正文节点。
  useEffect(() => {
    void import("./editor").then(({ startEditor }) =>
      startEditor((entries, current, clearSearch) => {
        setDesk({ entries, current });
        if (clearSearch) setSearch("");
      }),
    );
  }, []);

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
  }, [term, desk.entries]);

  const items = term ? hits : desk.entries;
  return (
    <aside aria-label="稿本">
      <header className="brand">
        <span className="brand-stamp" aria-hidden="true">
          <i>&#xE70F;</i>
        </span>
        <strong>笺记</strong>
        <button id="new" aria-label="新建手稿" title="新建手稿">
          <i aria-hidden="true">&#xE710;</i>
        </button>
      </header>
      <label className="library-search">
        <i aria-hidden="true">&#xE721;</i>
        <input
          id="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索手稿"
          aria-label="搜索标题或正文"
        />
      </label>
      <div className="list-heading">
        <h2>{term ? "搜索结果" : "我的稿本"}</h2>
        <span id="total">{items.length}</span>
      </div>
      <nav id="notes" aria-label="手稿列表">
        {term && error ? (
          <p role="alert">{error}</p>
        ) : (
          items.map((entry) => (
            <button
              key={entry.id}
              data-id={entry.id}
              title={entry.title || "未命名手稿"}
              aria-current={entry.id === desk.current ? "page" : undefined}
            >
              <i className="note-symbol" aria-hidden="true">
                &#xE8A5;
              </i>
              <strong>{entry.title || "未命名手稿"}</strong>
              <time dateTime={new Date(entry.modified).toISOString()}>
                {modifiedLabel(entry.modified)}
              </time>
              {"snippet" in entry && <small>{String(entry.snippet)}</small>}
            </button>
          ))
        )}
        {term && !error && !items.length && <p>没有匹配的手稿</p>}
      </nav>
      <div className="side-tools">
        <button id="memos">
          <i aria-hidden="true">&#xE70B;</i>独立便笺
        </button>
        <button id="options" aria-haspopup="dialog" title="设置" aria-label="设置">
          <i aria-hidden="true">&#xE713;</i>
        </button>
      </div>
    </aside>
  );
}
