import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const workbenchRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(workbenchRoot, "..");
const read = (path) => readFile(join(workbenchRoot, path), "utf8");
const forbiddenIdentity = ["qw" + "en", "ae" + "on", "dr" + "oyd", "fl" + "ux"];

test("provider smoke IPC owns fixed argv and accepts acknowledgement only", async () => {
  const source = await read("src-tauri/src/bridge/provider_smoke.rs");
  assert.match(source, /deny_unknown_fields/);
  assert.match(source, /pub approval_acknowledged: bool/);
  assert.match(source, /PROVIDER_SMOKE_PYTHON_MODULE: &str = "realforge\.cli"/);
  assert.match(source, /PROVIDER_SMOKE_ARGV: &\[&str\] = &\["provider", "smoke", "--json"\]/);
  assert.match(source, /\.arg\(PROVIDER_SMOKE_PYTHON_MODULE\)/);
  assert.match(source, /\.args\(PROVIDER_SMOKE_ARGV\)/);
  assert.doesNotMatch(source, /pub\s+(prompt|path|argv|args|endpoint|model)\s*:/);
  assert.doesNotMatch(source, /sh\s+-c|cmd\.exe|Command::new\([^p]/);
});

test("provider smoke bridge has no file, write, shell, or browser-network authority", async () => {
  const [rust, cargo, frontend, component] = await Promise.all([
    read("src-tauri/src/bridge/provider_smoke.rs"),
    read("src-tauri/Cargo.toml"),
    read("src/bridge/workbench-bridge.ts"),
    read("src/components/ProviderSmokeCard.tsx")
  ]);
  assert.doesNotMatch(cargo, /tauri-plugin-shell/);
  assert.doesNotMatch(rust, /fs::|read_dir|read_to_string|File::|TcpStream|reqwest/);
  assert.doesNotMatch(rust, /\.write\(|fs::write|OpenOptions/);
  assert.doesNotMatch(frontend, /\bfetch\s*\(|XMLHttpRequest/);
  assert.doesNotMatch(component, /\bfetch\s*\(|XMLHttpRequest|useWorkbenchStore|localStorage|sessionStorage/);
  assert.match(frontend, /invokeDesktop<ProviderSmokeResult>\("run_private_provider_smoke", \{ input \}\)/);
});

test("provider smoke UI has approval but no arbitrary prompt or model controls", async () => {
  const component = await read("src/components/ProviderSmokeCard.tsx");
  assert.match(component, /type="checkbox"/);
  assert.match(component, /approvalAcknowledged: true/);
  assert.match(component, /disabled=\{!desktop \|\| !approved \|\| running\}/);
  assert.match(component, /RESPONSE_PREVIEW_LIMIT = 160/);
  assert.match(component, /UNTRUSTED/);
  assert.doesNotMatch(component, /<textarea|type="text"|contentEditable/);
  assert.doesNotMatch(component, /saveApprovalAudit|recordApprovalAudit|clipboard/);
});

test("provider smoke response does not enter persisted approval history", async () => {
  const [component, auditModel, auditStore] = await Promise.all([
    read("src/components/ProviderSmokeCard.tsx"),
    read("src/audit/approval-audit.ts"),
    read("src-tauri/src/bridge/approval_audit_store.rs")
  ]);
  assert.doesNotMatch(component, /saveApprovalAudit|recordApprovalAudit|useWorkbenchStore|localStorage|sessionStorage/);
  assert.doesNotMatch(auditModel, /provider[_-]smoke/i);
  assert.doesNotMatch(auditStore, /provider[_-]smoke/i);
});

test("provider smoke product sources contain no forbidden private identity", async () => {
  const paths = [
    "src-tauri/src/bridge/provider_smoke.rs",
    "src/components/ProviderSmokeCard.tsx",
    "docs/provider-smoke-threat-model.md"
  ];
  for (const path of paths) {
    const source = (await read(path)).toLowerCase();
    for (const identity of forbiddenIdentity) {
      assert.ok(!source.includes(identity), `${path} contains a forbidden private identity`);
    }
  }
});

test("tracked files contain no weights or private provider config", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 4 * 1024 * 1024
  });
  const tracked = stdout.toString("utf8").split("\0").filter(Boolean);
  const weightSuffixes = [".safetensors", ".ckpt", ".gguf", ".pt", ".pth", ".onnx", ".mlx"];
  const privateConfig = [".realforge", ".local.toml"].join("");
  assert.ok(!tracked.some((path) => path.endsWith(privateConfig)), "private provider config must not be tracked");
  assert.ok(
    !tracked.some((path) => weightSuffixes.some((suffix) => path.toLowerCase().endsWith(suffix))),
    "model weight files must not be tracked"
  );
});
