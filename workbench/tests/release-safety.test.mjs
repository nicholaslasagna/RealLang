import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

const PRIVATE_KEY_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /untrusted comment: minisign (encrypted )?secret key/i,
  /REALFORGE_UPDATER_PRIVKEY/,
  /"privateKey"\s*:/i,
  /signing.{0,12}private.{0,12}key\s*[:=]\s*["'][A-Za-z0-9+/]{16}/i
];

test("no private signing key material is committed to config, source, or fixtures", async () => {
  const files = [
    "src-tauri/tauri.conf.json",
    "package.json",
    "src-tauri/src/bridge/update.rs",
    "src/components/UpdateCenterPanel.tsx",
    "src/data/release/release-readiness.ts",
    "src/features/updates/ReleaseReadinessPanel.tsx"
  ];
  for (const path of files) {
    const text = await read(path);
    for (const pattern of PRIVATE_KEY_PATTERNS) {
      assert.doesNotMatch(text, pattern, `private key material in ${path}`);
    }
  }
});

test("the updater references the public key only, never a private key env", async () => {
  const update = await read("src-tauri/src/bridge/update.rs");
  assert.match(update, /REALFORGE_UPDATER_PUBKEY/);
  assert.doesNotMatch(update, /PRIVKEY|PRIVATE_KEY|SECRET_KEY/);
  // The updater scaffold must not auto-install or allow install by default.
  assert.match(update, /install_allowed: false/);
});

test("tauri.conf does not embed an updater pubkey/endpoint or a shell plugin", async () => {
  const conf = await read("src-tauri/tauri.conf.json");
  // No non-empty pubkey baked into config for 0.17 (configured via env only).
  assert.doesNotMatch(conf, /"pubkey"\s*:\s*"[A-Za-z0-9]/);
  assert.doesNotMatch(conf, /tauri-plugin-shell|"shell"\s*:/);
  const cargo = await read("src-tauri/Cargo.toml");
  assert.doesNotMatch(cargo, /tauri-plugin-shell/);
});

test("the IPC handler adds no install/write/apply command and no shell plugin", async () => {
  const lib = await read("src-tauri/src/lib.rs");
  const handler = lib.slice(lib.indexOf("generate_handler!"), lib.indexOf("])", lib.indexOf("generate_handler!")));
  for (const forbidden of ["install", "apply", "write_", "commit", "merge", "_update_source", "tauri_plugin_shell"]) {
    assert.ok(!handler.includes(forbidden), `forbidden IPC token in handler: ${forbidden}`);
  }
  // Known read-only commands remain present.
  assert.match(handler, /get_update_status/);
  assert.match(handler, /run_approved_dry_run_action/);
  assert.match(handler, /run_security_scan_source/);
});

test("release readiness UI introduces no browser network, IPC, or execution primitive", async () => {
  const source = [
    await read("src/data/release/release-readiness.ts"),
    await read("src/features/updates/ReleaseReadinessPanel.tsx")
  ].join("\n");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /child_process/, /\binvoke\s*\(/, /@tauri-apps\/api/]) {
    assert.doesNotMatch(source, forbidden);
  }
});
