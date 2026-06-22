import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workbenchRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(workbenchRoot, path), "utf8");

const FORBIDDEN_IDENTITY = ["qw" + "en", "ae" + "on", "dr" + "oyd", "fl" + "ux"].map(
  (term) => new RegExp(`\\b${term}\\b`, "i")
);

// New / changed 0.32 main-composer chat files.
const CHAT_FILES = [
  "src/features/workbench/WorkbenchChatTurn.tsx",
  "src/features/composer/ComposerDock.tsx",
  "src/features/workbench/WorkbenchScreen.tsx"
];

// The composer chat path is presentation + a single existing bridge call. It must
// add no direct network/IPC/shell/persistence authority of its own.
const FORBIDDEN_AUTHORITY = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /child_process/,
  /\bWebSocket\b/,
  /127\.0\.0\.1/,
  /localhost/,
  /\binvoke\s*\(/,
  /localStorage/,
  /sessionStorage/,
  /Command::new/
];

test("0.32 chat files contain no forbidden private identity strings", async () => {
  for (const rel of CHAT_FILES) {
    const text = await read(rel);
    for (const pattern of FORBIDDEN_IDENTITY) {
      assert.doesNotMatch(text, pattern, `${rel} must not contain a forbidden identity string`);
    }
  }
});

test("0.32 chat files add no direct network/IPC/shell/persistence authority", async () => {
  for (const rel of CHAT_FILES) {
    const text = await read(rel);
    for (const pattern of FORBIDDEN_AUTHORITY) {
      assert.doesNotMatch(text, pattern, `${rel} must not introduce ${pattern}`);
    }
  }
});

test("the composer reuses the existing single chat-sandbox bridge, not a new path", async () => {
  const screen = await read("src/features/workbench/WorkbenchScreen.tsx");
  assert.match(screen, /runPrivateProviderChatSandbox/, "must reuse the existing chat sandbox bridge");
  // The exact call sends only the bounded prompt + acknowledgement — no path,
  // argv, file contents, workspace context, tools, or image options.
  assert.match(screen, /runPrivateProviderChatSandbox\(\{\s*prompt,\s*approvalAcknowledged:\s*true\s*\}\)/);
  // The chat path must not touch the approval audit.
  assert.doesNotMatch(screen, /recordApprovalAuditEntry/);
});

test("the local-model turn is labelled untrusted, capped, and not persisted", async () => {
  const turn = await read("src/features/workbench/WorkbenchChatTurn.tsx");
  assert.match(turn, /LOCAL UNTRUSTED/);
  assert.match(turn, /MAX_RESPONSE_CHARS = 4_096/);
  assert.match(turn, /not persisted/);
  assert.doesNotMatch(turn, /\bfetch\s*\(/);
});

test("the composer requires explicit desktop + approval before any send", async () => {
  const dock = await read("src/features/composer/ComposerDock.tsx");
  assert.match(dock, /if \(!desktop\)/);
  assert.match(dock, /if \(!approved\)/);
  // The dock never calls a provider itself — it only invokes the parent callback.
  assert.match(dock, /onAskLocalModel\?\.\(/);
  assert.doesNotMatch(dock, /runPrivateProviderChatSandbox/);
});
