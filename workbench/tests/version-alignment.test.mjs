import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

const WORKBENCH_VERSION = "0.16.0";

test("config bundle metadata all reports the aligned Workbench version", async () => {
  assert.equal((await readJson("package.json")).version, WORKBENCH_VERSION);
  assert.equal((await readJson("package-lock.json")).version, WORKBENCH_VERSION);
  assert.equal((await readJson("src-tauri/tauri.conf.json")).version, WORKBENCH_VERSION);
  assert.match(await read("src-tauri/Cargo.toml"), /^version = "0\.16\.0"/m);
});

test("Rust and frontend version constants are aligned", async () => {
  assert.match(await read("src-tauri/src/bridge/mod.rs"), /WORKBENCH_VERSION: &str = "0\.16\.0"/);
  assert.match(await read("src-tauri/src/bridge/update.rs"), /WORKBENCH_VERSION: &str = "0\.16\.0"/);
  assert.match(await read("src/bridge/web-fallback.ts"), /WORKBENCH_VERSION = "0\.16\.0"/);
  assert.match(await read("src/data/workbench-data.ts"), /workbenchVersion: "0\.16\.0"/);
});

test("RealForge backend version stays separate (2.7) and is not conflated", async () => {
  const data = await read("src/data/workbench-data.ts");
  assert.match(data, /version: "2\.7"/);
  // The two versions must not be equal anywhere.
  assert.notEqual("2.7", WORKBENCH_VERSION);
});

test("stale 0.12.0 / 0.10 / 0.15 version labels cannot silently return", async () => {
  const sources = [
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/tauri.conf.json",
    "src-tauri/src/bridge/mod.rs",
    "src-tauri/src/bridge/update.rs",
    "src/bridge/web-fallback.ts",
    "src/data/workbench-data.ts",
    "src/components/layout/Sidebar.tsx"
  ];
  for (const path of sources) {
    const text = await read(path);
    assert.doesNotMatch(text, /0\.12\.0/, `stale 0.12.0 in ${path}`);
    assert.doesNotMatch(text, /"0\.10"|= "0\.10"/, `stale 0.10 in ${path}`);
    assert.doesNotMatch(text, /0\.15(?!\d)/, `stale 0.15 in ${path}`);
  }
});
