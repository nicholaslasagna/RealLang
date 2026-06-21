import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("Tauri bridge uses direct Command spawn without shell plugin", async () => {
  const spawn = await read("src-tauri/src/bridge/spawn.rs");
  const lib = await read("src-tauri/src/lib.rs");
  const cargo = await read("src-tauri/Cargo.toml");
  const combined = `${spawn}\n${lib}\n${cargo}`;

  assert.match(spawn, /Command::new/);
  assert.match(lib, /load_readonly_report_source/);
  assert.doesNotMatch(cargo, /tauri-plugin-shell/);
  assert.doesNotMatch(cargo, /tauri_plugin_shell/);
  assert.doesNotMatch(combined, /cmd\.exe/);
  assert.doesNotMatch(combined, /sh\s+-c/);
  assert.doesNotMatch(combined, /shell_execute/);
});

test("Tauri IPC allowlist is source-ID based with fixed argv", async () => {
  const allowlist = await read("src-tauri/src/bridge/allowlist.rs");
  assert.match(allowlist, /"capabilities"/);
  assert.match(allowlist, /"slash"/);
  assert.match(allowlist, /"settings-doctor"/);
  assert.match(allowlist, /argv: &\["capabilities", "--json"\]/);
  assert.match(allowlist, /DENIED_SUBCOMMANDS/);
  assert.match(allowlist, /"scheduler-run"/);
  assert.doesNotMatch(allowlist, /argv: &\["scheduler-run"/);
  const sourceIds = [...allowlist.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sourceIds, ["capabilities", "slash", "settings-doctor"]);
});

test("0.12 composer has no browser network or process execution primitive", async () => {
  const source = [
    await read("src/composer/action-model.ts"),
    await read("src/composer/use-composer-runtime.ts"),
    await read("src/features/composer/ActionPreviewCard.tsx"),
    await read("src/features/composer/ComposerDock.tsx")
  ].join("\n");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /child_process/, /Command::new/, /\binvoke\s*\(/]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.match(source, /DISPLAY ONLY · NOT EXECUTABLE/);
  assert.match(source, /Approval bridge required/);
});

test("approved dry-run IPC contains exactly one fixed no-write action", async () => {
  const approval = await read("src-tauri/src/bridge/approval.rs");
  const types = await read("src-tauri/src/bridge/types.rs");
  const lib = await read("src-tauri/src/lib.rs");
  const allowlistBlock = approval.match(/APPROVED_DRY_RUN_ACTIONS:[\s\S]*?\n\];/)?.[0] ?? "";
  assert.match(allowlistBlock, /realc-check-hello-example/);
  assert.match(allowlistBlock, /python_module: "reallang\.cli"/);
  assert.match(allowlistBlock, /target: "examples\/hello\.real"/);
  assert.match(allowlistBlock, /argv_suffix: &\["--check"\]/);
  assert.equal((allowlistBlock.match(/id: "/g) ?? []).length, 1);
  for (const forbidden of ["repair", "apply-proposal", "scheduler-run", "commit", "merge", "update-check"]) {
    assert.doesNotMatch(allowlistBlock, new RegExp(forbidden));
  }
  assert.match(approval, /env_clear\(\)/);
  assert.match(approval, /PYTHONDONTWRITEBYTECODE/);
  assert.match(approval, /APPROVED_ACTION_TIMEOUT_MS/);
  assert.match(approval, /APPROVED_ACTION_MAX_STREAM_BYTES/);
  assert.match(approval, /untrusted: true/);
  assert.match(approval, /validate_workspace_target/);
  assert.match(types, /deny_unknown_fields/);
  assert.match(lib, /run_approved_dry_run_action/);
  assert.doesNotMatch(approval, /cmd\.exe|sh\s+-c|shell_execute/);
});

test("loaded report payload marks output untrusted", async () => {
  const spawn = await read("src-tauri/src/bridge/spawn.rs");
  assert.match(spawn, /untrusted: true/);
  assert.match(spawn, /"UNTRUSTED"/);
});

test("Tauri IPC exposes workspace resolution and health without shell plugin", async () => {
  const bridge = await read("src-tauri/src/bridge/mod.rs");
  const lib = await read("src-tauri/src/lib.rs");
  const cargo = await read("src-tauri/Cargo.toml");
  const workspace = await read("src-tauri/src/bridge/workspace.rs");
  const update = await read("src-tauri/src/bridge/update.rs");
  const combined = `${bridge}\n${lib}\n${workspace}\n${update}`;

  assert.match(combined, /get_workspace_resolution/);
  assert.match(combined, /check_bridge_health/);
  assert.match(combined, /select_workspace_directory/);
  assert.match(combined, /save_workspace_selection/);
  assert.match(combined, /clear_saved_workspace/);
  assert.match(combined, /get_update_status/);
  assert.match(combined, /check_for_update/);
  assert.match(update, /REALFORGE_UPDATE_ENDPOINT/);
  assert.match(update, /REALFORGE_UPDATER_PUBKEY/);
  assert.match(update, /install_allowed: false/);
  assert.match(workspace, /SavedPathMissing/);
  assert.doesNotMatch(cargo, /tauri-plugin-updater/);
  assert.doesNotMatch(cargo, /tauri-plugin-shell/);
  assert.doesNotMatch(cargo, /tauri_plugin_shell/);
  assert.doesNotMatch(combined, /Command::new\("sh"\)/);
});

test("frontend bridge client avoids fetch and refuses web execution", async () => {
  const source = [
    await read("src/bridge/workbench-bridge.ts"),
    await read("src/bridge/web-fallback.ts"),
    await read("src/bridge/detect-runtime.ts")
  ].join("\n");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /child_process/, /exec\s*\(/]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.match(source, /unsupported_web/);
  assert.match(source, /loadReadOnlyReportSource/);
  assert.match(source, /getWorkspaceResolution/);
  assert.match(source, /checkBridgeHealth/);
  assert.match(source, /getSavedWorkspace/);
  assert.match(source, /getUpdateStatus/);
  assert.match(source, /checkForUpdate/);
  assert.match(source, /webUpdateStatus/);
  assert.match(source, /runApprovedDryRunAction/);
  assert.match(source, /webRunApprovedDryRunAction/);
});
