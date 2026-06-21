import type {
  ApprovedDryRunActionId,
  ApprovedDryRunResult
} from "../bridge/types";

export const AUDIT_PREVIEW_LIMIT = 2_048;
export const AUDIT_SESSION_LIMIT = 50;

export type ApprovalAuditStatus =
  | "success"
  | "failed"
  | "timed_out"
  | "rejected"
  | "unavailable";

export type ApprovalTargetKind = "fixed_example" | "workspace_real_file";

export interface ApprovalAuditEntry {
  id: string;
  timestamp: string;
  actionId: ApprovedDryRunActionId;
  actionTitle: string;
  targetKind: ApprovalTargetKind;
  targetRelativePath?: string;
  workspaceLabel: "Selected workspace";
  commandSummary: string;
  acknowledgementKind: "explicit_checkbox";
  status: ApprovalAuditStatus;
  errorCode?: string;
  exitCode?: number;
  durationMs: number;
  stdoutPreview?: string;
  stderrPreview?: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  untrustedOutput: true;
  writesFiles: false;
  networkRequired: false;
  safetyLabels: readonly string[];
  source: "approved_dry_run_bridge";
}

interface CreateApprovalAuditEntryInput {
  actionId: ApprovedDryRunActionId;
  actionTitle: string;
  targetRelativePath?: string;
  result: ApprovedDryRunResult;
  measuredDurationMs: number;
  id?: string;
  timestamp?: string;
}

interface CappedPreview {
  value?: string;
  truncated: boolean;
}

function capPreview(value: string | undefined): CappedPreview {
  if (!value) return { truncated: false };
  if (value.length <= AUDIT_PREVIEW_LIMIT) return { value, truncated: false };
  return { value: value.slice(0, AUDIT_PREVIEW_LIMIT), truncated: true };
}

function safeRelativeTarget(actionId: ApprovedDryRunActionId, candidate?: string): string {
  if (actionId === "realc-check-hello-example") return "examples/hello.real";
  const normalized = (candidate ?? "").replace(/\\/g, "/").trim();
  if (
    !normalized ||
    normalized.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some((part) => part === "..") ||
    !normalized.toLowerCase().endsWith(".real")
  ) {
    return "[redacted-target]";
  }
  return normalized;
}

function statusFromResult(result: ApprovedDryRunResult): ApprovalAuditStatus {
  if (result.ok) return result.data.passed ? "success" : "failed";
  if (result.error.code === "timeout") return "timed_out";
  if (/approval|invalid|unknown/.test(result.error.code)) return "rejected";
  if (/unsupported|unavailable|not_ready|not_found|spawn|ipc|cli/.test(result.error.code)) return "unavailable";
  return "failed";
}

function safeErrorCode(result: ApprovedDryRunResult): string | undefined {
  if (result.ok) return undefined;
  return /^[a-z0-9_]{1,64}$/.test(result.error.code) ? result.error.code : "bridge_error";
}

function createAuditId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ? `approval-${randomUuid}` : `approval-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createApprovalAuditEntry(input: CreateApprovalAuditEntryInput): ApprovalAuditEntry {
  const execution = input.result.ok ? input.result.data : undefined;
  const targetRelativePath = safeRelativeTarget(
    input.actionId,
    execution?.relativePath ?? input.targetRelativePath
  );
  const stdout = capPreview(execution?.stdout);
  const stderr = capPreview(execution?.stderr);
  const errorCode = safeErrorCode(input.result);

  return {
    id: input.id ?? createAuditId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    actionId: input.actionId,
    actionTitle: input.actionTitle,
    targetKind:
      input.actionId === "realc-check-hello-example" ? "fixed_example" : "workspace_real_file",
    targetRelativePath,
    workspaceLabel: "Selected workspace",
    commandSummary: `realc ${targetRelativePath} --check`,
    acknowledgementKind: "explicit_checkbox",
    status: statusFromResult(input.result),
    ...(errorCode ? { errorCode } : {}),
    ...(execution ? { exitCode: execution.exitCode } : {}),
    durationMs: execution?.durationMs ?? Math.max(0, Math.round(input.measuredDurationMs)),
    ...(stdout.value ? { stdoutPreview: stdout.value } : {}),
    ...(stderr.value ? { stderrPreview: stderr.value } : {}),
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    untrustedOutput: true,
    writesFiles: false,
    networkRequired: false,
    safetyLabels: ["APPROVED", "DRY RUN", "UNTRUSTED OUTPUT", "NO WRITES", "NETWORK OFF", "LOCAL ONLY"],
    source: "approved_dry_run_bridge"
  };
}

export function appendApprovalAuditEntry(
  entries: readonly ApprovalAuditEntry[],
  entry: ApprovalAuditEntry
): ApprovalAuditEntry[] {
  return [entry, ...entries].slice(0, AUDIT_SESSION_LIMIT);
}

/** Metadata-only export. Process output and absolute workspace paths are intentionally omitted. */
export function formatSafeAuditSummary(entry: ApprovalAuditEntry): string {
  return [
    "RealForge approved dry-run summary",
    `Action: ${entry.actionTitle} (${entry.actionId})`,
    `Target: ${entry.targetRelativePath ?? "none"}`,
    `Status: ${entry.status}`,
    `Error code: ${entry.errorCode ?? "none"}`,
    `Exit code: ${entry.exitCode ?? "unavailable"}`,
    `Duration: ${entry.durationMs} ms`,
    `Timestamp: ${entry.timestamp}`,
    `Command: ${entry.commandSummary}`,
    "Safety: NO WRITES · NETWORK OFF · UNTRUSTED OUTPUT",
    "Output previews omitted from copied summary."
  ].join("\n");
}
