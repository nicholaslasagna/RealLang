import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("approval persistence is a fixed app-config file store, not a general write bridge", async () => {
  const store = await read("src-tauri/src/bridge/approval_audit_store.rs");
  const production = store.split("#[cfg(test)]")[0];
  const saveSignature = production.match(/pub fn save_approval_audit_log\([\s\S]*?\) -> ApprovalAuditSaveResult/)?.[0] ?? "";

  assert.match(production, /AUDIT_FILE_NAME: &str = "approval-audit-log\.json"/);
  assert.match(production, /config_dir\(\)/);
  assert.match(production, /MAX_AUDIT_ENTRIES: usize = 50/);
  assert.match(production, /MAX_AUDIT_FILE_BYTES: u64 = 128 \* 1024/);
  assert.match(production, /stdout_preview/);
  assert.match(production, /stdout_truncated = input\.stdout_truncated \|\| stdout_preview\.is_some\(\)/);
  assert.match(saveSignature, /entries: Vec<ApprovalAuditEntryInput>/);
  assert.doesNotMatch(saveSignature, /path|workspace|command|argv/);
  assert.doesNotMatch(production, /Command::new|reqwest|TcpStream|sh\s+-c|cmd\.exe/);
});

test("approval persistence IPC adds only fixed load, save, and clear operations", async () => {
  const lib = await read("src-tauri/src/lib.rs");
  const bridge = await read("src-tauri/src/bridge/mod.rs");
  const cargo = await read("src-tauri/Cargo.toml");

  for (const command of [
    "load_approval_audit_log",
    "save_approval_audit_log",
    "clear_approval_audit_log"
  ]) {
    assert.match(lib, new RegExp(command));
    assert.match(bridge, new RegExp(command));
  }
  assert.doesNotMatch(cargo, /tauri-plugin-shell|tauri_plugin_shell/);
  assert.doesNotMatch(lib, /apply_proposal|scheduler_run|install_update|commit_changes|merge_proposal/);
});

test("frontend persistence strips output and introduces no browser storage or network fallback", async () => {
  const source = [
    await read("src/audit/approval-audit.ts"),
    await read("src/bridge/workbench-bridge.ts"),
    await read("src/bridge/web-fallback.ts"),
    await read("src/state/workbench-store.ts")
  ].join("\n");

  assert.match(source, /prepareApprovalAuditEntriesForPersistence/);
  assert.match(source, /webLoadApprovalAuditLog/);
  assert.match(source, /session_only/);
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /localStorage/, /sessionStorage/, /indexedDB/]) {
    assert.doesNotMatch(source, forbidden);
  }
});
