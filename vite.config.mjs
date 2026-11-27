import { defineConfig } from "vite";
export default defineConfig({
  root: "ui",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: { input: ["ui/index.html", "ui/memo.html"] },
  },
});
