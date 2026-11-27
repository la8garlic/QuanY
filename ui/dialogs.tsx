import { locale, setLanguage, t, type Language } from "./i18n";
import { Check, Folder, Keyboard, Minus, Paintbrush, Plus, X } from "lucide-react";
import { standby } from "./ipc";
import { useRef, useState } from "react";
const sections = [
  ["system", "待命与快捷键", Keyboard],
  ["files", "文件与保存", Folder],
  ["writing", "写作外观", Paintbrush],
] as const;
type ChoiceProps = {
  name: "theme" | "leading" | "width";
  label: string;
  initial: string;
  options: [string, string][];
};

function WritingChoice({ name, label, initial, options }: ChoiceProps) {
  return (
    <fieldset className={name === "theme" ? "paper-field" : "choice-field"}>
      <legend>{label}</legend>
      <div className={name === "theme" ? "paper-choices" : "segments"}>
        {options.map(([value, text]) => (
          <label key={value}>
            <input type="radio" name={name} value={value} defaultChecked={initial === value} />
            {name === "theme" && <span className="paper-sample" data-paper={value} aria-hidden="true"><i /></span>}
            <span>{text}</span>
            {name === "theme" && <Check className="choice-check" aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Settings() {
  const licenses = useRef<HTMLDialogElement>(null);
  const [notices, setNotices] = useState("");
  const [switching, setSwitching] = useState(false);
  const [languageError, setLanguageError] = useState("");
  const [page, setPage] = useState<string>("system");
  return (
    <><dialog id="panel" aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">{t("设置")}</h2>
        <form method="dialog">
          <button className="control-close" aria-label={t("关闭设置")} title={t("关闭设置")}>
            <X aria-hidden="true" />
          </button>
        </form>
      </header>
      <div className="settings-tabs" role="group" aria-label={t("设置分类")}>
        {sections.map(([key, label, Icon]) => (
          <button key={key} data-page={key} aria-pressed={page === key} onClick={() => setPage(key)}>
            <Icon aria-hidden="true" />
            {t(label)}
          </button>
        ))}
      </div>
      <section data-settings="system" hidden={page !== "system"}>
        <label className="setting">
          {t("界面语言")}
          <select id="language" value={locale} disabled={switching} onChange={async event => {
            const next = event.target.value as Language;
            setSwitching(true);
            try {
              await standby.setLanguage(next === "en");
              setLanguage(next);
              setLanguageError("");
            } catch (error) { setLanguageError(String(error)); }
            finally { setSwitching(false); }
          }}>
            <option value="zh-CN" lang="zh-CN">简体中文</option>
            <option value="en" lang="en">English</option>
          </select>
        </label>
        {languageError && <p role="alert">{languageError}</p>}
        <h3>{t("随时待命")}</h3>
        <label className="setting">
          {t("关闭窗口后保留在托盘")}
          <input id="resident" type="checkbox" role="switch" />
        </label>
        <label className="setting">
          {t("登录 Windows 后在托盘启动")}
          <input id="autostart" type="checkbox" role="switch" />
        </label>
        <div className="setting">
          <span>{t("全局打开主窗口")}</span>
          <button id="main-key" className="keycap"></button>
        </div>
        <div className="setting">
          <span>{t("全局唤出速记窗")}</span>
          <button id="summon-key" className="keycap"></button>
        </div>
        <p id="standby-info" role="status"></p>
        <details id="key-list">
          <summary>{t("编辑器快捷键")}</summary>
          <div id="bindings"></div>
          <button id="reset-keys">{t("恢复编辑器默认键位")}</button>
        </details>
        <button id="show-licenses" onClick={async () => {
          if (!notices) {
            const response = await fetch("./licenses.txt");
            if (!response.ok) throw new Error("licenses.txt: " + response.status);
            setNotices(await response.text());
          }
          licenses.current!.showModal();
        }}>{t("许可证与第三方声明")}</button>
      </section>
      <section data-settings="files" hidden={page !== "files"}>
        <h3>{t("文件与保存")}</h3>
        <label htmlFor="folder">{t("新稿默认保存目录")}</label>
        <div className="folder-row">
          <input id="folder" spellCheck={false} />
          <button id="browse">{t("浏览…")}</button>
          <button className="control-primary" id="apply-folder">
            {t("应用")}
          </button>
        </div>
        <p id="folder-info" role="status"></p>
        <label className="setting">
          {t("停笔后自动保存")}
          <select id="delay">
            <option value="650">{t("0.65 秒")}</option>
            <option value="2000">{t("2 秒")}</option>
            <option value="5000">{t("5 秒")}</option>
          </select>
        </label>
      </section>
      <section data-settings="writing" hidden={page !== "writing"}>
        <WritingChoice name="theme" label={t("纸张")} initial="paper" options={[["paper", t("米白")], ["night", t("夜色")]]} />
        <div className="settings-grid">
          <label className="setting">
            {t("字体")}
            <select id="font">
              <option value="serif">{t("宋体")}</option>
              <option value="sans">{t("微软雅黑")}</option>
              <option value="mono">{t("等宽")}</option>
            </select>
          </label>
          <div className="setting">
            <span>{t("字号")}</span>
            <div className="stepper" role="group" aria-label={t("字号")}>
              <button id="smaller" aria-label={t("减小字号")}>
                <Minus aria-hidden="true" />
              </button>
              <output id="size"></output>
              <button id="larger" aria-label={t("增大字号")}>
                <Plus aria-hidden="true" />
              </button>
            </div>
          </div>
          <WritingChoice name="leading" label={t("行距")} initial="1.75" options={[["1.5", t("紧凑")], ["1.75", t("标准")], ["1.95", t("宽松")]]} />
          <WritingChoice name="width" label={t("正文宽度")} initial="reading" options={[["reading", t("阅读宽度")], ["full", t("铺满窗口")]]} />
          <label className="setting wrap-row">
            {t("自动换行")}
            <input id="wrap" type="checkbox" role="switch" />
          </label>
        </div>
      </section>
    </dialog>
    <dialog ref={licenses} id="licenses" aria-labelledby="licenses-title">
      <header><h2 id="licenses-title">{t("许可证与第三方声明")}</h2>
        <form method="dialog"><button className="control-close" aria-label={t("关闭")}><X /></button></form>
      </header>
      <textarea readOnly aria-labelledby="licenses-title" value={notices} />
    </dialog></>
  );
}
export function Dialogs() {
  return (
    <>
      <dialog id="history" className="work-dialog">
        <header>
          <h2>{t("版本历史")}</h2>
          <button className="control-close" id="history-close" aria-label={t("关闭历史")}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="history-tools">
          <select id="version-list" aria-label={t("选择历史版本")}></select>
          <button id="checkpoint">{t("保存当前版本")}</button>
        </div>
        <p id="version-state" role="status"></p>
        <div id="changes" aria-label={t("历史版与当前稿的逐行差异")}></div>
        <form method="dialog">
          <button id="restore" type="button">
            {t("恢复此版")}
          </button>
        </form>
      </dialog>
      <dialog id="memo-list" className="work-dialog">
        <header>
          <h2>{t("独立便笺")}</h2>
          <form method="dialog">
            <button className="control-close" aria-label={t("关闭便笺列表")}>
              <X aria-hidden="true" />
            </button>
          </form>
        </header>
        <div id="memo-items"></div>
        <button id="create-memo">{t("＋ 新建置顶便笺")}</button>
      </dialog>
      <dialog id="confirm">
        <h2>{t("从稿本移除这篇手稿？")}</h2>
        <p id="confirm-text"></p>
        <form method="dialog">
          <button value="cancel" autoFocus>
            {t("取消")}
          </button>
          <button value="delete" className="danger">
            {t("移除手稿")}
          </button>
        </form>
      </dialog>
      <Settings />
    </>
  );
}
