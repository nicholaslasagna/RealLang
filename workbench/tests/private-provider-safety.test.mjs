import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const workbenchRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (root, path) => readFile(join(root, path), "utf8");

const FORBIDDEN_IDENTITY = [
  /\bqwen\b/i,
  /\baeon\b/i,
  /\bdroyd\b/i
];

const WEIGHT_EXTENSIONS = [
  /\.safetensors\b/,
  /\.gguf\b/,
  /\.pth\b/,
  /\.onnx\b/,
  /\.mlx\b/
];

test("gitignore blocks private provider config and model weights", async () => {
  const rootIgnore = await read(repoRoot, ".gitignore");
  const workbenchIgnore = await read(workbenchRoot, ".gitignore");
  const combined = `${rootIgnore}\n${workbenchIgnore}`;
  for (const pattern of [
    ".realforge.local.toml",
    ".realforge.private.toml",
    "models/private/",
    "*.safetensors",
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
  assert.match(example, /local_untrusted/);
  assert.match(example, /\.realforge\.local\.toml/);
  assert.doesNotMatch(example, /sk-[A-Za-z0-9]{10,}/);
  for (const pattern of FORBIDDEN_IDENTITY) {
    assert.doesNotMatch(example, pattern);
  }
});

test("docs provider example matches public-safe template", async () => {
  const docExample = await read(repoRoot, "docs/provider-config.example.toml");
  assert.match(docExample, /<configured-locally>/);
  assert.doesNotMatch(docExample, /sk-[A-Za-z0-9]{10,}/);
});

test("private local model UI sources avoid forbidden identity strings", async () => {
  const sources = await Promise.all([
    read(workbenchRoot, "src/providers/model-profiles.ts"),
    read(workbenchRoot, "src/components/PrivateLocalModelPanel.tsx")
  ]);
  const combined = sources.join("\n");
  for (const pattern of FORBIDDEN_IDENTITY) {
    assert.doesNotMatch(combined, pattern);
  }
});

test("private local model panel does not use fetch or XMLHttpRequest", async () => {
  const panel = await read(workbenchRoot, "src/components/PrivateLocalModelPanel.tsx");
  const bridge = await read(workbenchRoot, "src/bridge/workbench-bridge.ts");
  assert.doesNotMatch(panel, /\bfetch\s*\(/);
  assert.doesNotMatch(panel, /XMLHttpRequest/);
  assert.doesNotMatch(bridge, /\bfetch\s*\(/);
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
