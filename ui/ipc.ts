/** 所有跨进程交互集中在这里，编辑界面只依赖稿件和稿本的类型。 */
export interface Entry { id: number; title: string; modified: number }
export interface Place { start: number; end: number; top: number }
export interface Note extends Entry { body: string; place: Place }
export interface Desk { entries: Entry[]; note: Note }

interface DesktopWindow {
  onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<() => void>;
  destroy(): Promise<void>;
}
declare global {
  interface Window {
    __TAURI__: {
      core: { invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> };
      window: { getCurrentWindow(): DesktopWindow };
    };
  }
}
const { invoke } = window.__TAURI__.core;
/** 读写成功的应答只在数据库提交之后返回。 */
export const library = {
  start: () => invoke<Desk>("start"),
  select: (id: number) => invoke<Note>("select_note", { id }),
  create: (title: string, body: string) => invoke<Desk>("create_note", { title, body }),
  save: (id: number, title: string, body: string, place: Place) => invoke<Entry>("save_note", { id, title, body, place }),
  bookmark: (id: number, place: Place) => invoke<void>("bookmark", { id, place }),
  remove: (id: number) => invoke<Desk>("delete_note", { id }),
  export: (title: string, body: string) => invoke<boolean>("export_text", { title, body }),
};
/** 宿主发出关闭请求后，编辑器可等最后一笔写入落盘再销毁窗口。 */
export const desktop = window.__TAURI__.window.getCurrentWindow();
