import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
function licenseText() {
  return execFileSync(process.execPath, ["scripts/notices.mjs"], { maxBuffer: 32 * 1024 * 1024 });
}

export default defineConfig({
  root: "ui",
  base: "./",
  plugins: [{
    name: "quany-licenses",
    generateBundle() {
      // Tauri embeds this asset. The editor loads it only when the notices are opened.
      this.emitFile({ type: "asset", fileName: "licenses.txt", source: licenseText() });
    },
    configureServer(server) {
      server.middlewares.use("/licenses.txt", (_request, response) => {
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(licenseText());
      });
    },
  }],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: { input: ["ui/index.html", "ui/memo.html"] },
  },
});
