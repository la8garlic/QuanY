/** 用物理键位绑定命令，中文输入法组合期间仍由输入法接管按键。 */
import { standby, type Bindings } from "./ipc.js";
import { el } from "./view.js";
const defaults = {
  new:"Ctrl+N", open:"Ctrl+O", save:"Ctrl+S", saveAs:"Ctrl+Shift+S",
  find:"Ctrl+F", replace:"Ctrl+H", focus:"F8", settings:"Ctrl+,", quick:"Ctrl+Shift+J", switcher:"Ctrl+K",
};
const labels = {new:"新建手稿",open:"打开文件",save:"保存",saveAs:"另存为",find:"查找",replace:"替换",focus:"专注模式",settings:"设置",quick:"切换速记窗",switcher:"快速切稿"};
const targets = {new:"new",open:"open-file",save:"save-file",saveAs:"save-as",find:"find-open",replace:"find-open",focus:"focus",settings:"options",quick:"quick-toggle",switcher:"switch-open"};
type Action = keyof typeof defaults;
const actions = Object.keys(defaults) as Action[];
const bindings = {...defaults};
const info = el("standby-info");
const message = info.textContent;
let globalKeys: Bindings;
let recording: Action | "summon" | "main" | null = null;
let updating = false;
const reserved = new Set(["F3","F5","Ctrl+R","Ctrl+A","Ctrl+C","Ctrl+V","Ctrl+X","Ctrl+Z","Ctrl+Y","Alt+F4"]);
function combo(e:KeyboardEvent) {
  const key = e.code.replace(/^Key(?=[A-Z]$)|^Digit(?=[0-9]$)/,"");
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Comma|Space)$/.test(key)) return "";
  return [e.ctrlKey && "Ctrl",e.altKey && "Alt",e.shiftKey && "Shift",e.metaKey && "Super",key==="Comma" ? "," : key].filter(Boolean).join("+");
}
function draw() {
  for (const a of actions) {
    el("key-"+a).textContent = recording===a ? "请按组合键…" : bindings[a] || "未分配";
    el(targets[a]).title = labels[a]+(bindings[a] ? "（"+bindings[a]+"）" : "");
  }
  el("find-open").title = "查找（"+bindings.find+"） / 替换（"+bindings.replace+"）";
  el("summon-key").textContent = recording==="summon" ? "请按组合键…" : globalKeys.quick.key;
  el("main-key").textContent = recording==="main" ? "请按组合键…" : globalKeys.main.key;
}
function remember() {
  for (const a of actions) localStorage.setItem("key-"+a,bindings[a]);
}
function record(a:typeof recording) {if(!updating){recording=a;info.textContent=message;draw();}}
async function accept(key:string) {
  const a=recording;
  if(a===null || updating)return;
  if(reserved.has(key) || !key || (!key.includes("+") && (a==="summon" || a==="main" || !/^F\d+$/.test(key)))) {
    info.textContent="请使用带修饰键的组合键或编辑器功能键，避开系统和文本编辑保留键。";return;
  }
  if(actions.some(other=>other!==a && bindings[other]===key) || (a!=="summon"&&globalKeys.quick.key===key) || (a!=="main"&&globalKeys.main.key===key)) {
    info.textContent="此组合键已经分配给其他操作。";return;
  }
  updating=true;
  try {
    if(a==="summon" || a==="main"){const target=a==="main"?"main":"quick";globalKeys[target]=await standby.bind(key,target); }
    else { bindings[a]=key; remember(); }
    recording=null;info.textContent="快捷键已保存。";
  } catch(error){info.textContent=String(error);}
  finally {updating=false;draw();}
}
export function localAction(e:KeyboardEvent) { const key=combo(e); return key ? actions.find(a=>bindings[a]===key) : undefined; }
export function initKeys(keys:Bindings, startup:boolean) {
  globalKeys=keys;
  for(const a of actions){
    const saved=localStorage.getItem("key-"+a);
    // 升级时优先保留已有键位；新命令仍可从工具栏打开并自行改键。
    const taken=a==="switcher" && (actions.some(other=>other!==a && bindings[other]===defaults[a]) || Object.values(keys).some(b=>b.key===defaults[a]));
    bindings[a]=saved ?? (taken ? "" : defaults[a]);
    const row=document.createElement("div"), name=document.createElement("span"), button=document.createElement("button");
    row.className="setting";name.textContent=labels[a];button.id="key-"+a;button.className="keycap";
    button.onclick=()=>record(a);row.append(name,button);el("bindings").append(row);
  }
  const resident=el<HTMLInputElement>("resident"),login=el<HTMLInputElement>("autostart");
  resident.checked=localStorage.getItem("resident")!=="off";
  resident.onchange=()=>localStorage.setItem("resident",resident.checked ? "on":"off");
  login.checked=startup;
  login.onchange=async()=>{
    const wanted=login.checked;login.disabled=true;
    try{login.checked=await standby.startup(wanted);info.textContent=login.checked?"下次登录 Windows 后将在托盘待命。":"已关闭登录启动。";}
    catch(error){login.checked=!wanted;info.textContent=String(error);}
    finally{login.disabled=false;}
  };
  el("main-key").onclick=()=>record("main");
  el("summon-key").onclick=()=>record("summon");
  el("reset-keys").onclick=()=>{
    if(Object.values(globalKeys).some(b=>Object.values(defaults).includes(b.key))){info.textContent="全局键占用默认编辑键位，请先更换全局键。";return;}
    Object.assign(bindings,defaults);remember();record(null);
  };
  el<HTMLDialogElement>("panel").addEventListener("close",()=>record(null));
  document.addEventListener("keydown",e=>{
    if(recording===null || e.isComposing)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.key==="Escape"){record(null);return;}
    if(["Control","Alt","Shift","Meta"].includes(e.key))return;
    void accept(combo(e));
  },true);
  draw();
  const issues=Object.values(keys).flatMap(b=>b.issue?[b.issue]:[]);
  if(issues.length)info.textContent=issues.join(" ");
}
