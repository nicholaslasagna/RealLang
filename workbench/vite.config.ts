import react from "@vitejs/plugin-react";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const publicAssets = join(root, "public", "assets");

if (!existsSync(publicAssets)) {
  mkdirSync(join(root, "public"), { recursive: true });
  cpSync(join(root, "assets"), publicAssets, { recursive: true });
}

export default defineConfig({
  plugins: [react()],
  publicDir: join(root, "public"),
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  }
});
