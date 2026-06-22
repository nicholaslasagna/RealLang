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
const readWorkbench = (path) => readFile(join(workbenchRoot, path), "utf8");
const readRepo = (path) => readFile(join(repoRoot, path), "utf8");
const forbiddenIdentity = ["qw" + "en", "ae" + "on", "dr" + "oyd", "fl" + "ux"];

test("chat sandbox CLI is stdin-only and bounded", async () => {
  const [runtime, cli, provider] = await Promise.all([
    readRepo("src/realforge/provider_chat_sandbox.py"),
    readRepo("src/realforge/cli.py"),
    readRepo("src/realforge/providers/openai_compatible_local.py")
  ]);
  assert.match(cli, /"chat-sandbox"/);
  assert.match(cli, /"--stdin"/);
  assert.match(cli, /sys\.stdin\.read\(CHAT_SANDBOX_MAX_PROMPT_CHARS \+ 1\)/);
  assert.match(runtime, /CHAT_SANDBOX_MAX_PROMPT_CHARS = 2_000/);
  assert.match(runtime, /CHAT_SANDBOX_MAX_RESPONSE_CHARS = 4_096/);
  assert.match(provider, /def chat_sandbox\(/);
  assert.match(provider, /self\._request_chat\(\s*None,\s*user,/s);
});

test("Tauri chat sandbox owns fixed argv and accepts no path or arbitrary args", async () => {
  const source = await readWorkbench("src-tauri/src/bridge/provider_chat_sandbox.rs");
  assert.match(source, /deny_unknown_fields/);
  assert.match(source, /pub prompt: String/);
  assert.match(source, /pub approval_acknowledged: bool/);
  assert.match(source, /CHAT_SANDBOX_ARGV: &\[&str\] = &\["provider", "chat-sandbox", "--stdin", "--json"\]/);
  assert.match(source, /\.stdin\(Stdio::piped\(\)\)/);
  assert.match(source, /stdin\.write_all\(prompt\.as_bytes\(\)\)/);
  assert.doesNotMatch(source, /pub\s+(path|argv|args|tools|model|endpoint)\s*:/);
  assert.doesNotMatch(source, /fs::|read_dir|read_to_string|File::|TcpStream|reqwest/);
});

test("Tauri chat cancellation is input-free, single-request, and kills the fixed child", async () => {
  const [rust, bridgeModule, library] = await Promise.all([
    readWorkbench("src-tauri/src/bridge/provider_chat_sandbox.rs"),
    readWorkbench("src-tauri/src/bridge/mod.rs"),
    readWorkbench("src-tauri/src/lib.rs")
  ]);
  assert.match(rust, /ACTIVE_CHAT_REQUEST/);
  assert.match(rust, /request_in_progress/);
  assert.match(rust, /cancellation\.store\(true, Ordering::Release\)/);
  assert.match(rust, /terminate_child\(&mut child\)/);
  assert.match(bridgeModule, /pub fn cancel_private_provider_chat_sandbox\(\)/);
  assert.match(library, /cancel_private_provider_chat_sandbox/);
  assert.doesNotMatch(bridgeModule, /cancel_private_provider_chat_sandbox\([^)]*(prompt|path|args|argv)/);
});

test("chat sandbox adds no shell, browser network, or write bridge", async () => {
  const [cargo, rust, bridge, component] = await Promise.all([
    readWorkbench("src-tauri/Cargo.toml"),
    readWorkbench("src-tauri/src/bridge/provider_chat_sandbox.rs"),
    readWorkbench("src/bridge/workbench-bridge.ts"),
    readWorkbench("src/components/PrivateChatSandboxCard.tsx")
  ]);
  assert.doesNotMatch(cargo, /tauri-plugin-shell/);
  assert.doesNotMatch(rust, /sh\s+-c|cmd\.exe|fs::write|OpenOptions|\.write\(/);
  assert.doesNotMatch(bridge, /\bfetch\s*\(|XMLHttpRequest/);
  assert.doesNotMatch(component, /\bfetch\s*\(|XMLHttpRequest|type="file"/);
  assert.match(
    bridge,
    /invokeDesktop<ProviderChatSandboxResult>\("run_private_provider_chat_sandbox", \{ input \}\)/
  );
  assert.match(
    bridge,
    /invokeDesktop<ProviderChatSandboxCancelResult>\("cancel_private_provider_chat_sandbox"\)/
  );
});

test("chat sandbox UI is single-turn, approval-gated, and non-persistent", async () => {
  const component = await readWorkbench("src/components/PrivateChatSandboxCard.tsx");
  assert.match(component, /MAX_PROMPT_CHARS = 2_000/);
  assert.match(component, /MAX_RESPONSE_CHARS = 4_096/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /approvalAcknowledged: true/);
  assert.match(component, /<textarea/);
  assert.match(component, /Clear sandbox/);
  assert.match(component, /Clear response/);
  assert.match(component, /Cancel request/);
  assert.match(component, /LOCAL UNTRUSTED/);
  assert.doesNotMatch(
    component,
    /useWorkbenchStore|localStorage|sessionStorage|saveApprovalAudit|recordApprovalAudit/
  );
  assert.match(component, /navigator\.clipboard\.writeText\(`LOCAL UNTRUSTED\\n\\n\$\{response\}`\)/);
  assert.doesNotMatch(component, /apply patch|run command|image generation button/i);
});

test("chat prompt and response do not enter persisted approval history", async () => {
  const [component, auditModel, auditStore] = await Promise.all([
    readWorkbench("src/components/PrivateChatSandboxCard.tsx"),
    readWorkbench("src/audit/approval-audit.ts"),
    readWorkbench("src-tauri/src/bridge/approval_audit_store.rs")
  ]);
  assert.doesNotMatch(component, /ApprovalAudit|approval-audit|saveApprovalAudit/);
  assert.doesNotMatch(auditModel, /chat[_-]sandbox/i);
  assert.doesNotMatch(auditStore, /chat[_-]sandbox/i);
});

test("chat sandbox product sources contain no forbidden private identity", async () => {
  const paths = [
    [repoRoot, "src/realforge/provider_chat_sandbox.py"],
    [workbenchRoot, "src-tauri/src/bridge/provider_chat_sandbox.rs"],
    [workbenchRoot, "src/components/PrivateChatSandboxCard.tsx"],
    [workbenchRoot, "docs/private-chat-sandbox-threat-model.md"]
  ];
  for (const [root, path] of paths) {
    const source = (await readFile(join(root, path), "utf8")).toLowerCase();
    for (const identity of forbiddenIdentity) {
      assert.ok(!source.includes(identity), `${path} contains a forbidden private identity`);
    }
  }
});

test("tracked and pending files contain no weights or private provider config", async () => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "buffer", maxBuffer: 4 * 1024 * 1024 }
  );
  const files = stdout.toString("utf8").split("\0").filter(Boolean);
  const weightSuffixes = [".safetensors", ".ckpt", ".gguf", ".pt", ".pth", ".onnx", ".mlx"];
  const privateConfig = [".realforge", ".local.toml"].join("");
  assert.ok(!files.some((path) => path.endsWith(privateConfig)));
  assert.ok(!files.some((path) => weightSuffixes.some((suffix) => path.toLowerCase().endsWith(suffix))));
});
