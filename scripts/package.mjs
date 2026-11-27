import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Cargo 可使用全局构建缓存，交付位置固定，便于直接双击启动。
const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--no-deps", "--format-version", "1"], { encoding: "utf8" }));
mkdirSync("release", { recursive: true });
const exe = join(metadata.target_directory, "release", "quany.exe");
let target = "release/QuanY.exe";
try {
  copyFileSync(exe, target);
} catch (error) {
  // Windows 锁定运行中的程序，旁放新版以保留正在编辑的会话。
  if (!["EBUSY","EPERM","EACCES"].includes(error.code)) throw error;
  target = `release/QuanY-${metadata.packages[0].version}.exe`;
  copyFileSync(exe, target);
}
// Explorer 可在原路径上继续使用上个版本的大图标；发布后通知 Shell 重新读取图像缓存。
execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", readFileSync("scripts/notify-shell.ps1", "utf8")], { windowsHide: true });
console.log("已生成 " + target);
