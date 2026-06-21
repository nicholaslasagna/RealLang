import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");

function fail(message) {
  console.error(`check-tauri: ${message}`);
  process.exit(1);
}

for (const rel of ["src-tauri/tauri.conf.json", "src-tauri/src/lib.rs", "src-tauri/src/bridge/mod.rs"]) {
  if (!existsSync(join(root, rel))) fail(`missing ${rel}`);
}

const cargo = spawnSync(
  "cargo",
  ["test", "--quiet", "--manifest-path", join(tauriDir, "Cargo.toml"), "--", "--test-threads=1"],
  {
  cwd: root,
  encoding: "utf8"
});

if (cargo.error && cargo.error.code === "ENOENT") {
  console.warn("check-tauri: cargo not found — skipping Rust tests (install Rust for full Tauri validation)");
  process.exit(0);
}

if (cargo.status !== 0) {
  console.error(cargo.stdout || cargo.stderr);
  fail("cargo test failed for src-tauri");
}

console.log("check-tauri: Rust IPC bridge tests passed");
