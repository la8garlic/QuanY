import { literalSearch } from "./search";
import { locale, t, type Message } from "./i18n";
import { FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Entry } from "./ipc";
import { writing } from "./writing";
import { manuscriptStats } from "./statistics";

export function DetailsDialog({
  entry,
  tags,
  close,
}: {
  entry: Entry;
  tags: string[];
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [names, setNames] = useState(entry.tags.join(locale === "en" ? ", " : "，"));
  const [pinned, setPinned] = useState(entry.pinned);
  const [target, setTarget] = useState(entry.goal ? String(entry.goal) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stats] = useState(() => manuscriptStats(writing.state));
  const parsed = [
    ...new Set(
      names
        .split(/[,，\n]/)
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ];
  useEffect(() => {
    ref.current!.showModal();
  }, []);
  return (
    <dialog
      id="note-details"
      className="catalog-dialog"
      ref={ref}
      onClose={close}
      aria-labelledby="details-heading"
    >
      <header>
        <h2 id="details-heading">{t("手稿详情")}</h2>
        <button className="control-close" aria-label={t("关闭详情")} onClick={() => ref.current!.close()}>
          <X aria-hidden="true" />
        </button>
      </header>
      <p className="entry-name">{entry.title || t("未命名手稿")}</p>
      <dl className="stats-grid">
        {Object.entries(stats).map(([name, value]) => (
          <div key={name}>
            <dt>{t(name as Message)}</dt>
            <dd>{value.toLocaleString(locale)}</dd>
          </div>
        ))}
      </dl>
      <form
        className="details-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            const { editDetails } = await import("./editor");
            if (await editDetails(entry.id, { pinned, tags: parsed, goal: Number(target) }))
              ref.current?.close();
            else setError(t("尚未应用，请检查主窗保存状态。"));
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="setting">
          {t("置顶到稿本顶部")}
          <input
            id="detail-pin"
            type="checkbox"
            role="switch"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
        </label>
        <label htmlFor="detail-tags">{t("标签")}</label>
        <input
          id="detail-tags"
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder={t("多个标签用逗号分隔")}
        />
        {tags.some((t) => !parsed.includes(t)) && (
          <div className="tag-suggestions">
            {tags
              .filter((t) => !parsed.includes(t))
              .slice(0, 8)
              .map((tag) => (
                <button type="button" key={tag} onClick={() => setNames([...parsed, tag].join(locale === "en" ? ", " : "，"))}>
                  ＋ {tag}
                </button>
              ))}
          </div>
        )}
        <label htmlFor="detail-goal">{t("本篇字数目标")}</label>
        <input
          id="detail-goal"
          type="number"
          min="0"
          max="4294967295"
          step="1"
          value={target}
          placeholder={t("留空关闭目标")}
          onChange={(e) => setTarget(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={() => ref.current!.close()}>
            {t("取消")}
          </button>
          <button className="apply" id="apply-details" disabled={saving}>
            {t("保存设置")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function QuickSwitcher({ entries, close }: { entries: Entry[]; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0);
  const term = query.trim(),
    pattern = literalSearch(term);
  const matches = entries
    .filter((n) => pattern.test(n.title || t("未命名手稿")))
    .slice(0, 15);
  const create = term !== "" && !entries.some((n) => n.title === term);
  const length = matches.length + Number(create);
  const index = Math.max(0, Math.min(selected, length - 1));
  useEffect(() => {
    ref.current!.showModal();
    ref.current!.querySelector("input")!.focus();
  }, []);
  useEffect(() => {
    ref.current!.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, query]);
  async function choose(which: number) {
    const editor = await import("./editor");
    const item = matches[which];
    if (item ? await editor.openManuscript(item.id) : create && (await editor.createManuscript(term)))
      ref.current?.close("opened");
  }
  return (
    <dialog
      id="quick-switch"
      className="catalog-dialog"
      ref={ref}
      onClose={(e) => {
        if (e.currentTarget.returnValue === "opened")
          writing.focus();
        close();
      }}
      aria-label={t("快速切稿")}
    >
      <header>
        <h2>{t("快速切稿")}</h2>
        <button className="control-close" aria-label={t("关闭快速切稿")} onClick={() => ref.current!.close()}>
          <X aria-hidden="true" />
        </button>
      </header>
      <input
        id="switch-query"
        aria-label={t("手稿标题")}
        autoFocus
        placeholder={t("输入标题，打开或新建手稿…")}
        role="combobox"
        aria-controls="switch-results"
        aria-expanded={true}
        aria-activedescendant={length ? "switch-item-" + index : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (length) setSelected((index + (e.key === "ArrowDown" ? 1 : -1) + length) % length);
          }
          if (e.key === "Enter" && length) {
            e.preventDefault();
            void choose(index);
          }
        }}
      />
      <div id="switch-results" role="listbox">
        {matches.map((n, i) => (
          <button
            role="option"
            id={"switch-item-" + i}
            aria-selected={index === i}
            key={n.id}
            onClick={() => void choose(i)}
          >
            <FileText aria-hidden="true" />
            {n.title || t("未命名手稿")}
          </button>
        ))}
        {create && (
          <button
            role="option"
            id={"switch-item-" + matches.length}
            aria-selected={index === matches.length}
            onClick={() => void choose(matches.length)}
          >
            ＋ {t("新建「{title}」").replace("{title}", () => term)}
          </button>
        )}
      </div>
      <p className="switch-hint">{t("↑ ↓ 选择　 Enter 打开　 Esc 关闭")}</p>
    </dialog>
  );
}
