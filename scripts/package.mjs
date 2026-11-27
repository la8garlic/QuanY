import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Cargo 可使用全局构建缓存，交付位置固定，便于直接双击启动。
const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--no-deps", "--format-version", "1"], { encoding: "utf8" }));
mkdirSync("release", { recursive: true });
copyFileSync(join(metadata.target_directory, "release", "jianji.exe"), "release/笺记.exe");
console.log("已生成 release/笺记.exe");
