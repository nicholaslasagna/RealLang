import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const workbenchRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (root, path) => readFile(join(root, path), "utf8");

const FORBIDDEN_IDENTITY = ["qw" + "en", "ae" + "on", "dr" + "oyd", "fl" + "ux"].map(
  (term) => new RegExp(`\\b${term}\\b`, "i")
);

const WEIGHT_EXTENSIONS = [
  /\.safetensors\b/,
  /\.ckpt\b/,
  /\.gguf\b/,
  /\.bin\b/,
  /\.pt\b/,
  /\.pth\b/,
  /\.onnx\b/,
  /\.mlx\b/
];

test("changed python private provider sources avoid forbidden identity strings", async () => {
  const paths = [
    "src/realforge/private_provider_config.py",
    "src/realforge/config.py",
    "src/realforge/provider_status.py",
    "src/realforge/provider_smoke.py"
  ];
  for (const rel of paths) {
    const text = await read(repoRoot, rel);
    for (const pattern of FORBIDDEN_IDENTITY) {
      assert.doesNotMatch(text, pattern, `${rel} must not contain forbidden identity`);
    }
  }
});

test("local config path is gitignored at repo root", async () => {
  const rootIgnore = await read(repoRoot, ".gitignore");
  const workbenchIgnore = await read(workbenchRoot, ".gitignore");
  const combined = `${rootIgnore}\n${workbenchIgnore}`;
  for (const pattern of [
    ".realforge.local.toml",
    ".realforge.private.toml",
    "models/private/",
    "*.safetensors",
    "*.ckpt",
    "*.gguf"
  ]) {
    assert.match(combined, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("provider example uses placeholders only", async () => {
  const example = await read(repoRoot, ".realforge.toml.example");
  assert.match(example, /openai_compatible_local/);
  assert.match(example, /Private Local Model/);
  assert.match(example, /<configured-locally>/);
  assert.match(example, /trust = "local_untrusted"/);
  assert.match(example, /\.realforge\.local\.toml/);
  assert.doesNotMatch(example, /\[model\.trust\]/);
  assert.doesNotMatch(example, /sk-[A-Za-z0-9]{10,}/);
  for (const pattern of FORBIDDEN_IDENTITY) {
    assert.doesNotMatch(example, pattern);
  }
});

test("docs provider example matches public-safe template", async () => {
  const docExample = await read(repoRoot, "docs/provider-config.example.toml");
  assert.match(docExample, /<configured-locally>/);
  assert.match(docExample, /trust = "local_untrusted"/);
  assert.doesNotMatch(docExample, /\[model\.trust\]/);
  assert.doesNotMatch(docExample, /sk-[A-Za-z0-9]{10,}/);
});

test("private local model UI sources avoid forbidden identity strings", async () => {
  const sources = await Promise.all([
    read(workbenchRoot, "src/providers/model-profiles.ts"),
    read(workbenchRoot, "src/providers/provider-readiness.ts"),
    read(workbenchRoot, "src/components/ProviderReadinessDashboard.tsx"),
    read(workbenchRoot, "src/components/PrivateLocalModelPanel.tsx")
  ]);
  const combined = sources.join("\n");
  for (const pattern of FORBIDDEN_IDENTITY) {
    assert.doesNotMatch(combined, pattern);
  }
});

test("provider readiness is frontend-only sanitized derivation with no persistence", async () => {
  const [model, dashboard, panel, smoke] = await Promise.all([
    read(workbenchRoot, "src/providers/provider-readiness.ts"),
    read(workbenchRoot, "src/components/ProviderReadinessDashboard.tsx"),
    read(workbenchRoot, "src/components/PrivateLocalModelPanel.tsx"),
    read(workbenchRoot, "src/components/ProviderSmokeCard.tsx")
  ]);
  const combined = `${model}\n${dashboard}\n${panel}\n${smoke}`;
  assert.match(model, /derivePrivateProviderReadiness/);
  assert.match(model, /imageProviderExecutionEnabled: false/);
  assert.match(model, /workspaceContextEnabled: false/);
  assert.match(model, /fileAccessEnabled: false/);
  assert.match(model, /toolsEnabled: false/);
  assert.match(model, /memoryEnabled: false/);
  assert.match(model, /persistenceEnabled: false/);
  assert.match(dashboard, /LOCAL UNTRUSTED/);
  assert.match(dashboard, /Disconnected by design/);
  assert.match(smoke, /onSessionStatusChange/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest/);
  assert.doesNotMatch(combined, /invokeDesktop|run_private_provider/);
  assert.doesNotMatch(model, /response_preview|api_key:|model_path|endpoint_host/);
});

test("private local image model scaffold stays generic and inert", async () => {
  const panel = await read(workbenchRoot, "src/components/PrivateLocalModelPanel.tsx");
  const profiles = await read(workbenchRoot, "src/providers/model-profiles.ts");
  assert.match(panel, /private-local-image-model-panel/);
  assert.match(profiles, /Private Local Image Model/);
  assert.match(panel, /FUTURE/);
  assert.match(panel, /DISABLED/);
  assert.match(panel, /api key configured/i);
  assert.match(profiles, /private-local-image/);
  assert.match(profiles, /local_image_provider/);
  assert.doesNotMatch(panel, /\bfetch\s*\(/);
});

test("private local model panel does not use fetch or XMLHttpRequest", async () => {
  const panel = await read(workbenchRoot, "src/components/PrivateLocalModelPanel.tsx");
  const bridge = await read(workbenchRoot, "src/bridge/workbench-bridge.ts");
  const loader = await read(workbenchRoot, "src-tauri/src/bridge/private_provider_config.rs");
  assert.doesNotMatch(panel, /\bfetch\s*\(/);
  assert.doesNotMatch(panel, /XMLHttpRequest/);
  assert.doesNotMatch(bridge, /\bfetch\s*\(/);
  assert.match(panel, /realforge provider status/);
  assert.match(panel, /realforge provider smoke/);
  assert.doesNotMatch(panel, /invokeDesktop.*provider status/);
  assert.match(loader, /load_private_local_provider_config/);
  assert.match(loader, /CONFIG_FILE_NAME/);
  assert.match(loader, /api_key_is_never_returned/);
});

test("private local provider IPC reads fixed home config only", async () => {
  const loader = await read(workbenchRoot, "src-tauri/src/bridge/private_provider_config.rs");
  const lib = await read(workbenchRoot, "src-tauri/src/lib.rs");
  const combined = `${loader}\n${lib}`;
  assert.match(combined, /load_private_local_provider_config/);
  assert.match(loader, /\.realforge\.local\.toml/);
  assert.doesNotMatch(loader, /Command::new/);
  assert.doesNotMatch(loader, /std::process::Command/);
});

test("private local provider IPC returns CLI-parity provider status report", async () => {
  const loader = await read(workbenchRoot, "src-tauri/src/bridge/private_provider_config.rs");
  assert.match(loader, /ProviderStatusReport/);
  assert.match(loader, /api_key_configured/);
  assert.match(loader, /image_provider_execution_enabled: false/);
  assert.match(loader, /parse_redacted_status/);
  assert.doesNotMatch(loader, /pub api_key: Option/);
  assert.doesNotMatch(loader, /pub model_path/);
});

test("private provider bridge adds no shell plugin, write bridge, network, or arbitrary IPC", async () => {
  const loader = await read(workbenchRoot, "src-tauri/src/bridge/private_provider_config.rs");
  const cargo = await read(workbenchRoot, "src-tauri/Cargo.toml");
  const bridge = await read(workbenchRoot, "src/bridge/workbench-bridge.ts");
  assert.doesNotMatch(cargo, /tauri-plugin-shell/);
  assert.doesNotMatch(loader, /fs::write|TcpStream|reqwest|Command::new/);
  assert.match(bridge, /invokeDesktop<ProviderStatus>\("load_private_local_provider_config"\)/);
  assert.doesNotMatch(bridge, /load_private_local_provider_config",\s*\{/);
});

test("model profile storesPrivateIdentityInRepo is false", async () => {
  const profiles = await read(workbenchRoot, "src/providers/model-profiles.ts");
  assert.match(profiles, /storesPrivateIdentityInRepo: false/);
  assert.match(profiles, /id: "private-local"/);
  assert.match(profiles, /trustLevel: "local_untrusted"/);
});

test("no model weight extensions tracked in workbench tree", async () => {
  const { readdir } = await import("node:fs/promises");
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "target") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(full)));
      else files.push(full);
    }
    return files;
  }
  const files = await walk(workbenchRoot);
  for (const file of files) {
    for (const pattern of WEIGHT_EXTENSIONS) {
      assert.ok(!pattern.test(file), `unexpected weight file tracked path: ${file}`);
    }
  }
});
