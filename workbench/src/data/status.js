(function registerDataStatus(global) {
  "use strict";

  const STATUS = Object.freeze({
    PASS: "PASS",
    WARN: "WARN",
    BLOCKED: "BLOCKED",
    VALIDATED: "VALIDATED",
    PENDING: "PENDING",
    UNKNOWN: "UNKNOWN"
  });

  const SAFETY = Object.freeze({
    DRY_RUN: "DRY RUN",
    UNTRUSTED: "UNTRUSTED",
    STAFF_ONLY: "STAFF ONLY",
    APPROVAL_REQUIRED: "APPROVAL REQUIRED",
    LOCAL_ONLY: "LOCAL ONLY",
    NETWORK_OFF: "NETWORK OFF",
    VALIDATED: "VALIDATED",
    READONLY: "READONLY",
    NO_WRITES: "NO WRITES"
  });

  const STATUS_ALIASES = Object.freeze({
    ok: STATUS.PASS,
    passed: STATUS.PASS,
    warning: STATUS.WARN,
    failed: STATUS.BLOCKED,
    error: STATUS.BLOCKED,
    valid: STATUS.VALIDATED,
    ready: STATUS.VALIDATED
  });

  const SAFETY_ALIASES = Object.freeze({
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

  function normalizeStatus(value, fallback = STATUS.UNKNOWN) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    const upper = trimmed.toUpperCase().replaceAll("_", " ").replaceAll("-", " ");
    if (Object.values(STATUS).includes(upper)) return upper;
    return STATUS_ALIASES[trimmed.toLowerCase()] || fallback;
  }

  function normalizeSafetyLabel(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const upper = trimmed.toUpperCase().replaceAll("_", " ").replaceAll("-", " ");
    if (Object.values(SAFETY).includes(upper)) return upper;
    return SAFETY_ALIASES[trimmed.toLowerCase()] || null;
  }

  function normalizeSafetyLabels(values, defaults = []) {
    const source = Array.isArray(values) ? values : [];
    return [...new Set([...defaults, ...source].map(normalizeSafetyLabel).filter(Boolean))];
  }

  function warning(path, code, message) {
    return Object.freeze({ path, code, message });
  }

  function asObject(value, warnings, path = "report") {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    warnings.push(warning(path, "invalid", "Expected an object; using safe defaults."));
    return {};
  }

  function readString(source, key, warnings, fallback = "", required = false) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (required || value !== undefined) warnings.push(warning(key, value === undefined ? "missing" : "invalid", `Expected a non-empty string; using ${JSON.stringify(fallback)}.`));
    return fallback;
  }

  function readBoolean(source, key, warnings, fallback = false) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (value !== undefined) warnings.push(warning(key, "invalid", `Expected a boolean; using ${fallback}.`));
    return fallback;
  }

  function readNumber(source, key, warnings, fallback = 0) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value !== undefined) warnings.push(warning(key, "invalid", `Expected a finite number; using ${fallback}.`));
    return fallback;
  }

  function readArray(source, key, warnings, fallback = []) {
    const value = source[key];
    if (Array.isArray(value)) return value;
    if (value !== undefined) warnings.push(warning(key, "invalid", "Expected an array; using an empty list."));
    return fallback;
  }

  global.RealForgeDataStatus = Object.freeze({
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
})(window);
