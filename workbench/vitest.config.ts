import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["tests/react/**/*.test.tsx", "tests/data/**/*.test.ts"],
    setupFiles: ["tests/react/setup.ts"],
    typecheck: {
      tsconfig: "./tsconfig.vitest.json"
    }
  }
});
