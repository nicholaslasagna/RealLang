import { describe, expect, it } from "vitest";
import {
  AUDIT_PREVIEW_LIMIT,
  AUDIT_SESSION_LIMIT,
  appendApprovalAuditEntry,
  createApprovalAuditEntry,
  formatSafeAuditSummary
} from "../../src/audit/approval-audit";
import type { ApprovedDryRunResult } from "../../src/bridge/types";

function successResult(overrides: Record<string, unknown> = {}): ApprovedDryRunResult {
  return {
    ok: true,
    data: {
      actionId: "realc-check-workspace-file",
      title: "Check a workspace .real file",
      commandSummary: "untrusted backend summary",
      relativePath: "src/main.real",
      workspacePath: "/Users/private/RealLang",
      exitCode: 0,
      passed: true,
      stdout: "check ok",
      stderr: "",
      durationMs: 18,
      writesFiles: false,
      networkRequired: false,
      untrusted: true,
      safetyLabels: [],
      ...overrides
    }
  } as ApprovedDryRunResult;
}

function entry(result: ApprovedDryRunResult = successResult()) {
  return createApprovalAuditEntry({
    id: "audit-1",
    timestamp: "2026-06-21T12:00:00.000Z",
    actionId: "realc-check-workspace-file",
    actionTitle: "Check a workspace .real file",
    targetRelativePath: "src/main.real",
    result,
    measuredDurationMs: 20
  });
}

describe("approval audit model", () => {
  it("creates a sanitized, immutable-safety audit shape", () => {
    const audit = entry();
    expect(audit).toMatchObject({
      id: "audit-1",
      targetKind: "workspace_real_file",
      targetRelativePath: "src/main.real",
      workspaceLabel: "Selected workspace",
      commandSummary: "realc src/main.real --check",
      acknowledgementKind: "explicit_checkbox",
      status: "success",
      exitCode: 0,
      untrustedOutput: true,
      writesFiles: false,
      networkRequired: false,
      source: "approved_dry_run_bridge"
    });
    expect(JSON.stringify(audit)).not.toContain("/Users/private/RealLang");
    expect(audit.safetyLabels).toEqual(expect.arrayContaining(["UNTRUSTED OUTPUT", "NO WRITES", "NETWORK OFF"]));
  });

  it("caps stdout and stderr previews independently", () => {
    const audit = entry(successResult({
      stdout: "o".repeat(AUDIT_PREVIEW_LIMIT + 8),
      stderr: "e".repeat(AUDIT_PREVIEW_LIMIT + 4)
    }));
    expect(audit.stdoutPreview).toHaveLength(AUDIT_PREVIEW_LIMIT);
    expect(audit.stderrPreview).toHaveLength(AUDIT_PREVIEW_LIMIT);
    expect(audit.stdoutTruncated).toBe(true);
    expect(audit.stderrTruncated).toBe(true);
  });

  it.each([
    [{ ok: true, data: { ...successResult().data, passed: false, exitCode: 1 } }, "failed"],
    [{ ok: false, error: { code: "timeout", message: "deadline" } }, "timed_out"],
    [{ ok: false, error: { code: "invalid_target", message: "bad path" } }, "rejected"],
    [{ ok: false, error: { code: "workspace_not_ready", message: "missing" } }, "unavailable"]
  ] as const)("maps bridge outcome %# to %s", (result, expected) => {
    expect(entry(result as ApprovedDryRunResult).status).toBe(expected);
  });

  it("retains only a constrained bridge error code", () => {
    const audit = entry({ ok: false, error: { code: "timeout", message: "/private/path and secret output" } });
    expect(audit.errorCode).toBe("timeout");
    expect(JSON.stringify(audit)).not.toContain("/private/path");
  });

  it("redacts unsafe target candidates and never reuses backend command text", () => {
    const audit = createApprovalAuditEntry({
      actionId: "realc-check-workspace-file",
      actionTitle: "Check a workspace .real file",
      targetRelativePath: "/private/outside.real",
      result: { ok: false, error: { code: "invalid_target", message: "rejected" } },
      measuredDurationMs: 2,
      id: "audit-redacted"
    });
    expect(audit.targetRelativePath).toBe("[redacted-target]");
    expect(audit.commandSummary).toBe("realc [redacted-target] --check");
  });

  it("copies metadata only and excludes output, secrets, and absolute workspace paths", () => {
    const audit = entry(successResult({
      stdout: "PROVIDER_KEY=secret-value",
      stderr: "/Users/private/RealLang/internal"
    }));
    const summary = formatSafeAuditSummary(audit);
    expect(summary).toContain("realc src/main.real --check");
    expect(summary).toContain("Output previews omitted");
    expect(summary).not.toContain("secret-value");
    expect(summary).not.toContain("/Users/private");
  });

  it("keeps only the newest session entries", () => {
    const entries = Array.from({ length: AUDIT_SESSION_LIMIT }, (_, index) => ({
      ...entry(),
      id: `old-${index}`
    }));
    const updated = appendApprovalAuditEntry(entries, { ...entry(), id: "newest" });
    expect(updated).toHaveLength(AUDIT_SESSION_LIMIT);
    expect(updated[0].id).toBe("newest");
    expect(updated.some((item) => item.id === `old-${AUDIT_SESSION_LIMIT - 1}`)).toBe(false);
  });
});
