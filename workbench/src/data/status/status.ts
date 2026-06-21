import type { AdapterWarning, ReportStatus, SafetyLabel } from "../contracts/report-contracts";

export const STATUS = Object.freeze({
  PASS: "PASS",
  WARN: "WARN",
  BLOCKED: "BLOCKED",
  VALIDATED: "VALIDATED",
  PENDING: "PENDING",
  UNKNOWN: "UNKNOWN"
} as const);

export const SAFETY = Object.freeze({
  DRY_RUN: "DRY RUN",
  UNTRUSTED: "UNTRUSTED",
  STAFF_ONLY: "STAFF ONLY",
  APPROVAL_REQUIRED: "APPROVAL REQUIRED",
  LOCAL_ONLY: "LOCAL ONLY",
  NETWORK_OFF: "NETWORK OFF",
  VALIDATED: "VALIDATED",
  READONLY: "READONLY",
  NO_WRITES: "NO WRITES"
} as const);

const STATUS_ALIASES: Record<string, ReportStatus> = Object.freeze({
  ok: STATUS.PASS,
  passed: STATUS.PASS,
  warning: STATUS.WARN,
  failed: STATUS.BLOCKED,
  error: STATUS.BLOCKED,
  valid: STATUS.VALIDATED,
  ready: STATUS.VALIDATED
});

const SAFETY_ALIASES: Record<string, SafetyLabel> = Object.freeze({
  "dry-run": SAFETY.DRY_RUN,
  dry_run: SAFETY.DRY_RUN,
  untrusted_output: SAFETY.UNTRUSTED,
  "staff-only": SAFETY.STAFF_ONLY,
  staff_only: SAFETY.STAFF_ONLY,
  approval: SAFETY.APPROVAL_REQUIRED,
  approval_required: SAFETY.APPROVAL_REQUIRED,
  local: SAFETY.LOCAL_ONLY,
  local_only: SAFETY.LOCAL_ONLY,
  network_off: SAFETY.NETWORK_OFF,
  read_only: SAFETY.READONLY,
  "read-only": SAFETY.READONLY,
  no_writes: SAFETY.NO_WRITES
});

export function normalizeStatus(value: unknown, fallback: ReportStatus = STATUS.UNKNOWN): ReportStatus {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase().replaceAll("_", " ").replaceAll("-", " ") as ReportStatus;
  if (Object.values(STATUS).includes(upper)) return upper;
  return STATUS_ALIASES[trimmed.toLowerCase()] || fallback;
}

export function normalizeSafetyLabel(value: unknown): SafetyLabel | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase().replaceAll("_", " ").replaceAll("-", " ") as SafetyLabel;
  if (Object.values(SAFETY).includes(upper)) return upper;
  return SAFETY_ALIASES[trimmed.toLowerCase()] || null;
}

export function normalizeSafetyLabels(values: unknown, defaults: SafetyLabel[] = []): SafetyLabel[] {
  const source = Array.isArray(values) ? values : [];
  return [...new Set([...defaults, ...source].map(normalizeSafetyLabel).filter((label): label is SafetyLabel => Boolean(label)))];
}

export function warning(path: string, code: AdapterWarning["code"], message: string): AdapterWarning {
  return Object.freeze({ path, code, message });
}

export function asObject(value: unknown, warnings: AdapterWarning[], path = "report"): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  warnings.push(warning(path, "invalid", "Expected an object; using safe defaults."));
  return {};
}

export function readString(
  source: Record<string, unknown>,
  key: string,
  warnings: AdapterWarning[],
  fallback = "",
  required = false
): string {
  const value = source[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required || value !== undefined) {
    warnings.push(
      warning(key, value === undefined ? "missing" : "invalid", `Expected a non-empty string; using ${JSON.stringify(fallback)}.`)
    );
  }
  return fallback;
}

export function readBoolean(source: Record<string, unknown>, key: string, warnings: AdapterWarning[], fallback = false): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  if (value !== undefined) warnings.push(warning(key, "invalid", `Expected a boolean; using ${fallback}.`));
  return fallback;
}

export function readNumber(source: Record<string, unknown>, key: string, warnings: AdapterWarning[], fallback = 0): number {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value !== undefined) warnings.push(warning(key, "invalid", `Expected a finite number; using ${fallback}.`));
  return fallback;
}

export function readArray(source: Record<string, unknown>, key: string, warnings: AdapterWarning[], fallback: unknown[] = []): unknown[] {
  const value = source[key];
  if (Array.isArray(value)) return value;
  if (value !== undefined) warnings.push(warning(key, "invalid", "Expected an array; using an empty list."));
  return fallback;
}

export const dataStatus = Object.freeze({
  STATUS,
  SAFETY,
  normalizeStatus,
  normalizeSafetyLabel,
  normalizeSafetyLabels,
  warning,
  asObject,
  readString,
  readBoolean,
  readNumber,
  readArray
});

export type DataStatusApi = typeof dataStatus;
