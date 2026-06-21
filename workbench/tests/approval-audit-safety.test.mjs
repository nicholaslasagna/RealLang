import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auditModel = new URL("../src/audit/approval-audit.ts", import.meta.url);
const auditView = new URL("../src/features/audit/ApprovalAuditLog.tsx", import.meta.url);
const tauriLib = new URL("../src-tauri/src/lib.rs", import.meta.url);

test("approval audit remains frontend-only and introduces no execution or persistence surface", async () => {
  const [model, view, lib] = await Promise.all([
    readFile(auditModel, "utf8"),
    readFile(auditView, "utf8"),
    readFile(tauriLib, "utf8")
  ]);

  assert.doesNotMatch(`${model}\n${view}`, /\bfetch\s*\(/);
  assert.doesNotMatch(`${model}\n${view}`, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(`${model}\n${view}`, /\binvoke\s*\(/);
  assert.doesNotMatch(lib, /audit_log|persist_audit|write_audit/);
  assert.match(model, /untrustedOutput: true/);
  assert.match(model, /writesFiles: false/);
  assert.match(model, /networkRequired: false/);
});
