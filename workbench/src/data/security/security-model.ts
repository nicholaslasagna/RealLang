// Workbench 0.13 — Security Center typed model.
//
// UI-only, honest, and safe. These types and helpers describe vulnerabilities and
// preview-only remediation plans. Nothing here executes a tool, writes a file,
// modifies a dependency manifest, or contacts the network. A fix plan is a
// preview composed locally from the finding; it is always untrusted and always
// requires human review and approval before any (future) execution path.

import type { SecurityScanSourceMeta } from "../../bridge/types";

export type SecuritySource =
  | "dependabot"
  | "npm_audit"
  | "cargo_audit"
  | "manual_review"
  | "realforge_audit";

export type SecurityEcosystem = "npm" | "cargo" | "python" | "realforge" | "tauri" | "unknown";

export type SecuritySeverity = "critical" | "high" | "moderate" | "low" | "info";

export type SecurityStatus = "open" | "resolved" | "blocked" | "deferred" | "ignored";

export type FixExecutionStatus = "preview_only" | "dry_run_available" | "approval_required" | "blocked";

export interface SecurityFinding {
  readonly id: string;
  readonly source: SecuritySource;
  readonly ecosystem: SecurityEcosystem;
  readonly packageName: string;
  readonly currentVersion: string | null;
  readonly patchedVersion: string | null;
  readonly severity: SecuritySeverity;
  readonly status: SecurityStatus;
  readonly affectedFiles: readonly string[];
  readonly advisoryId: string | null;
  readonly cveId?: string | null;
  readonly ghsaId?: string | null;
  readonly summary: string;
  readonly details: string;
  readonly impact: string;
  readonly exposure: string;
  readonly fixAvailable: boolean;
  readonly fixBlockedReason: string | null;
  readonly recommendedAction: string;
  readonly riskNotes: readonly string[];
  readonly lastCheckedAt: string;
  /** Only true when derived from verified local tool output. Fixtures default false. */
  readonly trustedSource: boolean;
  readonly needsHumanReview: boolean;
  /** Display tags such as "LINUX ONLY" or "WINDOWS". */
  readonly platformTags?: readonly string[];
}

export interface SecurityScanSummary {
  readonly total: number;
  readonly open: number;
  readonly resolved: number;
  readonly blocked: number;
  readonly deferred: number;
  readonly ignored: number;
  readonly critical: number;
  readonly high: number;
  readonly moderate: number;
  readonly low: number;
  readonly info: number;
  readonly lastCheckedAt: string;
  readonly sources: readonly SecuritySource[];
  readonly status: "pass" | "warn" | "blocked";
}

export interface SecurityFixPlan {
  readonly findingId: string;
  readonly title: string;
  readonly proposedSteps: readonly string[];
  readonly filesLikelyTouched: readonly string[];
  readonly commandsToValidate: readonly string[];
  readonly risks: readonly string[];
  readonly rollbackPlan: string;
  readonly executionStatus: FixExecutionStatus;
  readonly writesFiles: boolean;
  readonly approvalRequired: boolean;
  readonly staffRequired: boolean;
  readonly generatedByAi: boolean;
  readonly untrusted: boolean;
}

const SEVERITY_KEYS: readonly SecuritySeverity[] = ["critical", "high", "moderate", "low", "info"];

export function summarizeFindings(
  findings: readonly SecurityFinding[],
  lastCheckedAt?: string
): SecurityScanSummary {
  const counts = {
    open: 0,
    resolved: 0,
    blocked: 0,
    deferred: 0,
    ignored: 0,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0
  };
  const sources = new Set<SecuritySource>();
  let latest = lastCheckedAt ?? "";
  for (const finding of findings) {
    counts[finding.status] += 1;
    counts[finding.severity] += 1;
    sources.add(finding.source);
    if (finding.lastCheckedAt > latest) latest = finding.lastCheckedAt;
  }
  // Honest posture: open findings need attention (warn); a blocked-upstream
  // advisory with nothing open is surfaced as blocked, never as pass.
  const status: SecurityScanSummary["status"] =
    counts.open > 0 ? "warn" : counts.blocked > 0 ? "blocked" : "pass";
  return {
    total: findings.length,
    open: counts.open,
    resolved: counts.resolved,
    blocked: counts.blocked,
    deferred: counts.deferred,
    ignored: counts.ignored,
    critical: counts.critical,
    high: counts.high,
    moderate: counts.moderate,
    low: counts.low,
    info: counts.info,
    lastCheckedAt: latest,
    sources: [...sources],
    status
  };
}

export function severityTone(severity: SecuritySeverity): string {
  if (severity === "critical" || severity === "high") return "amber";
  if (severity === "moderate") return "amber";
  if (severity === "low") return "cyan";
  return "neutral";
}

export function statusTone(status: SecurityStatus): string {
  if (status === "resolved") return "green";
  if (status === "blocked") return "violet";
  if (status === "open") return "amber";
  return "neutral";
}

export function ecosystemLabel(ecosystem: SecurityEcosystem): string {
  return ecosystem.toUpperCase();
}

export function severityRank(severity: SecuritySeverity): number {
  return SEVERITY_KEYS.indexOf(severity);
}

function validationCommandsFor(finding: SecurityFinding): string[] {
  if (finding.ecosystem === "npm") {
    return ["npm audit", `npm ls ${finding.packageName}`];
  }
  if (finding.ecosystem === "cargo" || finding.ecosystem === "tauri") {
    const commands = [`cargo tree -i ${finding.packageName}`];
    if (finding.patchedVersion) {
      commands.push(
        `cargo update -p ${finding.packageName} --precise ${finding.patchedVersion}`
      );
    }
    return commands;
  }
  if (finding.ecosystem === "python") {
    return [".venv/bin/pip list --outdated", ".venv/bin/pytest -q"];
  }
  return ["Review the advisory and the affected files manually."];
}

/**
 * Compose a preview-only remediation plan from a finding.
 *
 * This is a deterministic, local template — no AI model is wired in 0.13, so
 * `generatedByAi` is `false`. The plan never writes files and never executes;
 * `executionStatus` reflects what a *future, approval-gated* path could do.
 */
export function buildFixPlan(finding: SecurityFinding): SecurityFixPlan {
  const base = {
    findingId: finding.id,
    filesLikelyTouched: finding.affectedFiles,
    commandsToValidate: validationCommandsFor(finding),
    staffRequired: false,
    generatedByAi: false,
    untrusted: true,
    writesFiles: false,
    approvalRequired: true
  } as const;

  if (finding.status === "resolved") {
    return {
      ...base,
      title: `Validate the resolved ${finding.packageName} advisory`,
      proposedSteps: [
        `Confirm the patched version (${finding.patchedVersion ?? "patched"}) is installed.`,
        "Re-run the dependency audit and confirm it is clean.",
        "Record the resolution and date in docs/security-dependencies.md."
      ],
      risks: [
        "Preview only — no command is executed and no file is modified in 0.13.",
        "A regression could reintroduce the advisory; re-validate after dependency changes."
      ],
      rollbackPlan: "No change is applied; there is nothing to roll back.",
      executionStatus: "preview_only"
    };
  }

  if (finding.status === "blocked") {
    return {
      ...base,
      title: `Track ${finding.packageName} upstream and retry on dependency bump`,
      proposedSteps: [
        finding.fixBlockedReason
          ? `Acknowledge the blocker: ${finding.fixBlockedReason}`
          : "Acknowledge that no compatible upgrade is currently available.",
        `Re-attempt the precise upgrade to ${finding.patchedVersion ?? "the patched version"} on each upstream/dependency bump.`,
        "Keep the advisory visible in Dependabot and documented in docs/security-dependencies.md."
      ],
      risks: [
        "Preview only — no dependency change is attempted in 0.13.",
        `Do not hand-pin ${finding.packageName}; forcing it would break the build without fixing the issue.`,
        ...finding.riskNotes
      ],
      rollbackPlan: "No dependency change is attempted; there is nothing to roll back.",
      executionStatus: "blocked"
    };
  }

  // open / deferred / ignored
  return {
    ...base,
    title: `Plan an upgrade for ${finding.packageName}`,
    proposedSteps: [
      `Review the patched version (${finding.patchedVersion ?? "patched"}) and its changelog.`,
      "On a branch, update the manifest manually (no automatic edit in 0.13).",
      "Run the validation commands and confirm the audit is clean.",
      "Open a human-reviewed pull request; do not auto-apply or auto-merge."
    ],
    risks: [
      "Preview only — RealForge does not modify dependency files from the UI.",
      "Upgrades can introduce breaking changes; validate before relying on the result.",
      ...finding.riskNotes
    ],
    rollbackPlan: "Revert the manifest/lockfile change on the branch; nothing is applied automatically.",
    executionStatus: "approval_required"
  };
}

// --- 0.14 read-only scan bridge: catalog + live-output mapping ---

// Frontend catalog metadata for the allowlisted read-only scan sources. The Rust
// allowlist (src-tauri/src/bridge/security_scan.rs) is the actual execution
// boundary; this drives display and the web fallback. IDs must match.
export const SECURITY_SCAN_CATALOG: readonly SecurityScanSourceMeta[] = Object.freeze([
  {
    id: "npm-audit-json",
    label: "npm audit (JSON)",
    description: "npm advisory audit for the Workbench package tree. May query the npm registry.",
    displayCommand: "npm audit --json",
    ecosystem: "npm",
    outputFormat: "json",
    requiresNetwork: true,
    readOnly: true
  },
  {
    id: "cargo-tree",
    label: "cargo dependency tree",
    description: "Full Rust dependency tree for the desktop shell (evidence, not a vulnerability scan).",
    displayCommand: "cargo tree",
    ecosystem: "cargo",
    outputFormat: "text",
    requiresNetwork: false,
    readOnly: true
  },
  {
    id: "cargo-tree-glib",
    label: "cargo tree -i glib",
    description: "Traces the glib dependency path on the Linux target (evidence for the blocked glib advisory).",
    displayCommand: "cargo tree -i glib --target x86_64-unknown-linux-gnu",
    ecosystem: "cargo",
    outputFormat: "text",
    requiresNetwork: true,
    readOnly: true
  }
]) as readonly SecurityScanSourceMeta[];

export interface NpmAuditSummary {
  readonly total: number;
  readonly critical: number;
  readonly high: number;
  readonly moderate: number;
  readonly low: number;
  readonly info: number;
}

function npmSeverity(value: unknown): SecuritySeverity {
  if (value === "critical" || value === "high" || value === "moderate" || value === "low") return value;
  return "info";
}

export function parseNpmAuditSummary(raw: string): NpmAuditSummary | null {
  try {
    const data = JSON.parse(raw) as { metadata?: { vulnerabilities?: Record<string, unknown> } };
    const v = data.metadata?.vulnerabilities ?? {};
    const num = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : 0);
    return {
      total: num("total"),
      critical: num("critical"),
      high: num("high"),
      moderate: num("moderate"),
      low: num("low"),
      info: num("info")
    };
  } catch {
    return null;
  }
}

/**
 * Map `npm audit --json` output into live SecurityFindings.
 *
 * Live scan output is treated as UNTRUSTED evidence: `trustedSource` stays false,
 * `needsHumanReview` stays true, and `fixAvailable` reflects only what npm
 * reported. Unknown/odd shapes degrade to risk notes instead of throwing.
 */
export function mapNpmAuditToFindings(raw: string, lastCheckedAt: string): readonly SecurityFinding[] {
  let data: { vulnerabilities?: Record<string, unknown> };
  try {
    data = JSON.parse(raw) as { vulnerabilities?: Record<string, unknown> };
  } catch {
    return [];
  }
  const vulns = data.vulnerabilities;
  if (!vulns || typeof vulns !== "object") return [];

  const findings: SecurityFinding[] = [];
  for (const [name, entryRaw] of Object.entries(vulns)) {
    const entry = (entryRaw && typeof entryRaw === "object" ? entryRaw : {}) as Record<string, unknown>;
    const via = Array.isArray(entry.via) ? entry.via : [];
    const advisory = via.find((v) => v && typeof v === "object") as Record<string, unknown> | undefined;
    const fixRaw = entry.fixAvailable;
    const fixAvailable = fixRaw === true || (fixRaw !== false && fixRaw != null);
    const patched =
      fixRaw && typeof fixRaw === "object" && typeof (fixRaw as Record<string, unknown>).version === "string"
        ? ((fixRaw as Record<string, unknown>).version as string)
        : null;
    const titles = via
      .map((v) => (typeof v === "string" ? v : ((v as Record<string, unknown>)?.title as string)))
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    const advisoryId =
      advisory && typeof advisory.url === "string" ? advisory.url : advisory && typeof advisory.source === "number" ? String(advisory.source) : null;

    findings.push({
      id: `live-npm-${name}`,
      source: "npm_audit",
      ecosystem: "npm",
      packageName: name,
      currentVersion: typeof entry.range === "string" ? entry.range : null,
      patchedVersion: patched,
      severity: npmSeverity(entry.severity),
      status: "open",
      affectedFiles: ["workbench/package-lock.json"],
      advisoryId,
      cveId: null,
      ghsaId: advisory && typeof advisory.url === "string" && advisory.url.includes("GHSA") ? advisory.url.split("/").pop() ?? null : null,
      summary: titles[0] ?? `npm advisory affecting ${name}`,
      details: titles.length ? titles.join("; ") : `Reported by npm audit for ${name}.`,
      impact: "Severity and impact are reported by npm audit and remain untrusted until reviewed.",
      exposure: "Local Workbench package tree. npm audit may query the npm registry.",
      fixAvailable,
      fixBlockedReason: null,
      recommendedAction: fixAvailable
        ? "Review the advisory and plan a manual, reviewed upgrade (no auto-fix)."
        : "Review the advisory; no npm-reported fix is available yet.",
      riskNotes: [
        "Live npm audit evidence — untrusted until reviewed.",
        "RealForge does not run npm audit fix or modify lockfiles."
      ],
      lastCheckedAt,
      trustedSource: false,
      needsHumanReview: true,
      platformTags: ["NPM", "LIVE"]
    });
  }
  return findings;
}
