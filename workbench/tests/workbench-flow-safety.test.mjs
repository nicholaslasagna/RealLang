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

// New 0.31 conversation-flow components.
const NEW_FLOW_FILES = [
  "src/features/workbench/WorkbenchGreeting.tsx",
  "src/features/workbench/WorkbenchFlowHint.tsx",
  "src/features/workbench/WorkbenchResultCard.tsx"
];

// All files touched by the 0.31 flow pass.
const FLOW_TOUCHED_FILES = [
  ...NEW_FLOW_FILES,
  "src/features/workbench/WorkbenchScreen.tsx",
  "src/features/composer/ApprovedDryRunPanel.tsx"
];

// The flow pass is presentation only — it must add no execution authority.
const FORBIDDEN_AUTHORITY = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /child_process/,
  /\bWebSocket\b/,
  /127\.0\.0\.1/,
  /localhost/,
  /\binvoke\s*\(/,
  /localStorage/,
  /sessionStorage/
];

test("0.31 flow files contain no forbidden private identity strings", async () => {
  for (const rel of FLOW_TOUCHED_FILES) {
    const text = await read(rel);
    for (const pattern of FORBIDDEN_IDENTITY) {
      assert.doesNotMatch(text, pattern, `${rel} must not contain a forbidden identity string`);
    }
  }
});

test("new 0.31 flow components add no network/IPC/shell/persistence authority", async () => {
  for (const rel of NEW_FLOW_FILES) {
    const text = await read(rel);
    for (const pattern of FORBIDDEN_AUTHORITY) {
      assert.doesNotMatch(text, pattern, `${rel} must not introduce ${pattern}`);
    }
  }
});

test("approved dry-run result presentation stays inert and untrusted", async () => {
  const text = await read("src/features/workbench/WorkbenchResultCard.tsx");
  assert.match(text, /UNTRUSTED OUTPUT/, "result card must label output untrusted");
  assert.match(text, /cannot trigger apply, repair, commit, merge, update, or scheduler/i);
  assert.doesNotMatch(text, /\bfetch\s*\(/);
});
