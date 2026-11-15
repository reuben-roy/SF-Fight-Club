import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const shim = (name: string): string => fileURLToPath(new URL(`./src/shims/${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
  build: { target: "es2022" },
  resolve: {
    // The engine and schema barrels import Node-only helpers for their CLI and
    // test loaders. The app only uses pure helpers, so point those modules at
    // small browser shims instead of shipping Node builtins to the browser.
    alias: {
      "node:path": shim("node-path.ts"),
      "node:url": shim("node-url.ts"),
      "node:fs": shim("node-fs.ts"),
    },
  },
});
