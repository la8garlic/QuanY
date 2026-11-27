import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { desktop } from "./ipc";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const value = await desktop.isMaximized();
      if (active) setMaximized(value);
    };
    const listening = desktop.listen("tauri://resize", refresh);
    void listening.then(refresh);
    return () => {
      active = false;
      void listening.then((unlisten) => unlisten());
    };
  }, []);
  const maximizeLabel = maximized ? "还原" : "最大化";
  return (
    <div className="window-controls" role="group" aria-label="窗口控制">
      <button type="button" title="最小化" aria-label="最小化" onClick={() => void desktop.minimize()}>
        <Minus />
      </button>
      <button type="button" title={maximizeLabel} aria-label={maximizeLabel} onClick={() => void desktop.toggleMaximize()}>
        {maximized ? <Copy /> : <Square />}
      </button>
      {/* 发送系统关闭请求，沿用待命设置和编辑器的最后一次保存。 */}
      <button type="button" className="window-close" title="关闭" aria-label="关闭" onClick={() => void desktop.close()}>
        <X />
      </button>
    </div>
  );
}
