import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Cargo 的目标平台过滤覆盖运行时依赖和构建工具，输出只含上游版本、网址及声明。
const target = "x86_64-pc-windows-msvc";
const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--locked", "--format-version", "1", "--filter-platform", target], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
const supplements = {
  "alloc-stdlib": "alloc-stdlib.txt",
  "selectors": "selectors-MPL-2.0.txt",
  "tauri-plugin": "tauri-plugin.txt",
  "webview2-com": "webview2-rs.txt",
  "webview2-com-sys": "webview2-rs.txt",
  "webview2-com-macros": "webview2-rs.txt",
};
const sections = ["QuanY third-party notices", "Dependency sources are available at the versioned URLs below. License texts retain their upstream terms."];
function collect(name, version, license, url, directory) {
  const paths = readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isFile() && /^(licen[cs]e|copying|copyright|notice|unlicense)([._-]|$)/i.test(entry.name))
    .map(entry => join(directory, entry.name)).sort();
  if (!paths.length && supplements[name]) paths.push(join("scripts/license-texts", supplements[name]));
  if (!paths.length) throw Error("Missing license text for " + name + " " + version);
  sections.push([name + " " + version, license, url, ...paths.map(path => readFileSync(path, "utf8").trim())].join("\n"));
}
for (const pkg of metadata.packages.filter(p => p.source).sort((a,b) => a.id.localeCompare(b.id, "en"))) {
  collect(pkg.name, pkg.version, pkg.license, "https://crates.io/crates/" + pkg.name + "/" + pkg.version, dirname(pkg.manifest_path));
}
// React 的调度器会进入前端包，Vite 还会注入模块预加载辅助代码。
for (const name of ["react", "react-dom", "scheduler", "lucide-react", "vite"]) {
  const directory = join("node_modules", name);
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  collect(name, pkg.version, pkg.license, "https://www.npmjs.com/package/" + name + "/v/" + pkg.version, directory);
}
sections.push("Microsoft WebView2 SDK loader\nhttps://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3800.47",
  ...["Microsoft-WebView2-SDK.txt", "Microsoft-WebView2-NOTICE.txt"].map(file => readFileSync(join("scripts/license-texts", file), "utf8")));
process.stdout.write([readFileSync("LICENSE", "utf8"), readFileSync("NOTICE", "utf8"), ...sections].join("\n\n") + "\n");
