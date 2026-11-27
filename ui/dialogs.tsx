import { useState } from "react";
const sections = [
  ["system", "待命与快捷键"],
  ["files", "文件与保存"],
  ["writing", "写作外观"],
] as const;
function Settings() {
  const [page, setPage] = useState<string>("system");
  return (
    <dialog id="panel" aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">设置</h2>
        <form method="dialog">
          <button aria-label="关闭设置">完成</button>
        </form>
      </header>
      <div className="settings-tabs" aria-label="设置分类">
        {sections.map(([key, label]) => (
          <button key={key} data-page={key} aria-pressed={page === key} onClick={() => setPage(key)}>
            {label}
          </button>
        ))}
      </div>
      <section data-settings="system" hidden={page !== "system"}>
        <h3>随时待命</h3>
        <label className="setting">
          关闭窗口后保留在托盘
          <input id="resident" type="checkbox" />
        </label>
        <label className="setting">
          登录 Windows 后在托盘启动
          <input id="autostart" type="checkbox" />
        </label>
        <div className="setting">
          <span>全局打开主窗口</span>
          <button id="main-key" className="keycap"></button>
        </div>
        <div className="setting">
          <span>全局唤出速记窗</span>
          <button id="summon-key" className="keycap"></button>
        </div>
        <p id="standby-info" role="status">
          点击键位后按新组合键，Esc 取消。托盘右键可保存并退出。
        </p>
        <details id="key-list">
          <summary>编辑器快捷键</summary>
          <div id="bindings"></div>
          <button id="reset-keys">恢复编辑器默认键位</button>
        </details>
      </section>
      <section data-settings="files" hidden={page !== "files"}>
        <h3>文件与保存</h3>
        <label htmlFor="folder">新稿默认保存目录</label>
        <div className="folder-row">
          <input id="folder" spellCheck={false} />
          <button id="browse">浏览…</button>
          <button id="apply-folder">应用</button>
        </div>
        <p id="folder-info" role="status">
          新稿首次保存时在此创建 TXT；已有文件继续保存到原位置。
        </p>
        <label className="setting">
          停笔后自动保存
          <select id="delay">
            <option value="650">0.65 秒</option>
            <option value="2000">2 秒</option>
            <option value="5000">5 秒</option>
          </select>
        </label>
      </section>
      <section data-settings="writing" hidden={page !== "writing"}>
        <h3>写作外观</h3>
        <div className="settings-grid">
          <label className="setting">
            字体
            <select id="font">
              <option value="serif">宋体</option>
              <option value="sans">微软雅黑</option>
              <option value="mono">等宽</option>
            </select>
          </label>
          <div className="setting">
            <span>字号</span>
            <button id="smaller" aria-label="减小字号">
              −
            </button>
            <output id="size"></output>
            <button id="larger" aria-label="增大字号">
              ＋
            </button>
          </div>
          <label className="setting">
            行距
            <select id="leading" defaultValue="1.75">
              <option value="1.5">紧凑</option>
              <option value="1.75">标准</option>
              <option value="1.95">宽松</option>
            </select>
          </label>
          <label className="setting">
            纸张
            <select id="theme">
              <option value="paper">米白</option>
              <option value="night">夜色</option>
            </select>
          </label>
          <label className="setting">
            正文宽度
            <select id="width">
              <option value="reading">阅读宽度</option>
              <option value="full">铺满窗口</option>
            </select>
          </label>
          <label className="setting">
            自动换行
            <input id="wrap" type="checkbox" />
          </label>
        </div>
      </section>
    </dialog>
  );
}
export function Dialogs() {
  return (
    <>
      <dialog id="history" className="work-dialog">
        <header>
          <h2>版本历史</h2>
          <button id="history-close" aria-label="关闭历史">
            ×
          </button>
        </header>
        <div className="history-tools">
          <select id="version-list" aria-label="选择历史版本"></select>
          <button id="checkpoint">保存当前版本</button>
        </div>
        <p id="version-state" role="status"></p>
        <div id="changes" aria-label="历史版与当前稿的逐行差异"></div>
        <form method="dialog">
          <button id="restore" type="button">
            恢复此版
          </button>
        </form>
      </dialog>
      <dialog id="memo-list" className="work-dialog">
        <header>
          <h2>独立便笺</h2>
          <form method="dialog">
            <button aria-label="关闭便笺列表">×</button>
          </form>
        </header>
        <div id="memo-items"></div>
        <button id="create-memo">＋ 新建置顶便笺</button>
      </dialog>
      <dialog id="confirm">
        <h2>从稿本移除这篇手稿？</h2>
        <p id="confirm-text"></p>
        <form method="dialog">
          <button value="cancel" autoFocus>
            取消
          </button>
          <button value="delete" className="danger">
            移除手稿
          </button>
        </form>
      </dialog>
      <Settings />
    </>
  );
}
