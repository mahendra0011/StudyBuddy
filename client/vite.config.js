import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);

export default defineConfig({
  root: __dirname,
  envDir: projectRoot,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4173"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
