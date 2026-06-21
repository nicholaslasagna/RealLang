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
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    ...(process.env.TAURI_ENV_PLATFORM
      ? {
          // Tauri WebView targets; chrome105 works on WebView2 (Win) and modern WKWebView (macOS).
          target: "chrome105",
          minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild"
        }
      : {})
  }
});
