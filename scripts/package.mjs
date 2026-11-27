import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Cargo 可使用全局构建缓存，交付位置固定，便于直接双击启动。
const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--no-deps", "--format-version", "1"], { encoding: "utf8" }));
mkdirSync("release", { recursive: true });
const exe = join(metadata.target_directory, "release", "jianji.exe");
let target = "release/笺记.exe";
try {
  copyFileSync(exe, target);
} catch (error) {
  // Windows 锁定运行中的程序，旁放新版以保留正在编辑的会话。
  if (!["EBUSY","EPERM","EACCES"].includes(error.code)) throw error;
  target = `release/笺记-${metadata.packages[0].version}.exe`;
  copyFileSync(exe, target);
}
console.log("已生成 " + target);
