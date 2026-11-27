/** 所有跨进程交互集中在这里，编辑界面只依赖稿件和稿本的类型。 */
export interface Entry { id: number; title: string; modified: number }
export interface Place { start: number; end: number; top: number }
export interface Snapshot {id:number;title:string;body:string;place:Place}
export interface Note extends Entry, Snapshot { path: string | null; pending: boolean; notice: string | null }
export interface Desk { entries: Entry[]; note: Note; folder:string }
export interface Written {title:string;body:string}
export interface Revision {seq:number;title:string;written:number}
export interface SearchHit extends Entry {snippet:string}
export interface Saved { entry: Entry; path: string }

interface DesktopWindow {
  onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<() => void>;
  destroy(): Promise<void>;
  hide(): Promise<void>;
  listen<T>(name:string,handler:(event:{payload:T})=>void):Promise<()=>void>;
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
  search:(term:string)=>invoke<SearchHit[]>("search_notes",{term}),
  reference:(id:number)=>invoke<Written>("reference_note",{id}),
  revisions:(id:number)=>invoke<Revision[]>("revisions",{id}),
  version:(id:number,seq:number)=>invoke<Written>("revision_text",{id,seq}),
  mark:(id:number)=>invoke<void>("mark_version",{id}),
  memos:()=>invoke<{id:number;preview:string}[]>("memo_list"),
  openMemo:(id:number|null)=>invoke<void>("open_memo",{id}),
  readMemo:()=>invoke<string>("memo_read"),
  writeMemo:(body:string)=>invoke<void>("memo_write",{body}),
  deleteMemo:()=>invoke<void>("memo_delete"),
  closeMemos:()=>invoke<void>("exit_editor"),
  start: () => invoke<Desk>("start"),
  select: (id: number) => invoke<Note>("select_note", { id }),
  create: (title: string, body: string) => invoke<Desk>("create_note", { title, body }),
  save: (note: Snapshot) => invoke<Saved>("save_note", { note }),
  bookmark: (id: number, place: Place) => invoke<void>("bookmark", { id, place }),
  remove: (id: number) => invoke<Desk>("delete_note", { id }),
  open: () => invoke<Desk|null>("open_text"),
  saveAs: (note:Snapshot, dirty:boolean) => invoke<Saved|null>("save_as",{note,dirty}),
  chooseFolder: () => invoke<string|null>("choose_folder"),
  setFolder: (path:string) => invoke<string>("set_folder",{path}),
  openLocation: (id:number) => invoke<void>("open_location",{id}),
};
/** 宿主发出关闭请求后，编辑器可等最后一笔写入落盘再销毁窗口。 */
export const desktop = window.__TAURI__.window.getCurrentWindow();

export type GlobalTarget="quick"|"main";
export type Bindings=Record<GlobalTarget,Binding>;
export interface Binding {key:string;issue:string|null}
/** 桌面设置的应答反映实际系统注册结果。 */
export const standby = {
  read: () => invoke<{bindings:Bindings;autostart:boolean;compact:boolean}>("standby_settings"),
  startup: (enabled:boolean) => invoke<boolean>("set_autostart",{enabled}),
  bind: (key:string,target:GlobalTarget) => invoke<Binding>("bind_summon",{key,target}),
  display: (compact:boolean) => invoke<void>("display_editor",{compact}),
};
