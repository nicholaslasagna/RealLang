// Cross-platform virtualenv Python resolution for the dev-only CLI bridge.
//
// Prefers the repo `.venv` interpreter (macOS/Linux bin/ or Windows Scripts/).
// Falls back to a fixed `python3` / `python` command name resolved via PATH by
// execFileSync — never a shell, never user-supplied text.

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Relative venv interpreter paths, Unix then Windows. */
export const VENV_PYTHON_CANDIDATES = Object.freeze([
  [".venv", "bin", "python"],
  [".venv", "bin", "python3"],
  [".venv", "Scripts", "python.exe"],
  [".venv", "Scripts", "python"]
]);

/**
 * @param {string} repoRoot
 * @param {{ exists?: (path: string) => boolean; platform?: string; allowPathFallback?: boolean }} [opts]
 * @returns {string | null}
 */
export function resolvePython(repoRoot, opts = {}) {
  const exists = opts.exists ?? existsSync;
  const allowPathFallback = opts.allowPathFallback !== false;

  for (const parts of VENV_PYTHON_CANDIDATES) {
    const candidate = join(repoRoot, ...parts);
    if (exists(candidate)) return candidate;
  }

  if (!allowPathFallback) return null;

  const platform = opts.platform ?? process.platform;
  return platform === "win32" ? "python" : "python3";
}
