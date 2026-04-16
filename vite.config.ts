import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/webview",
  build: {
    outDir: resolve(__dirname, "webview-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/webview/index.html"),
    },
  },
});
