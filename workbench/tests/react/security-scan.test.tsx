import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapNpmAuditToFindings,
  parseNpmAuditSummary,
  SECURITY_SCAN_CATALOG
} from "../../src/data/security/security-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => false),
  checkBridgeHealth: vi.fn(),
  runSecurityScanSource: vi.fn()
}));

vi.mock("../../src/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/bridge")>();
  return {
    ...actual,
    isDesktopRuntime: mocks.isDesktopRuntime,
    checkBridgeHealth: mocks.checkBridgeHealth,
    runSecurityScanSource: mocks.runSecurityScanSource
  };
});

import { SecurityScanPanel } from "../../src/features/security/SecurityScanPanel";

const NPM_AUDIT_JSON = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    lodash: {
      name: "lodash",
      severity: "high",
      range: "<4.17.21",
      via: [{ title: "Prototype pollution in lodash", url: "https://github.com/advisories/GHSA-test", severity: "high" }],
      fixAvailable: { name: "lodash", version: "4.17.21" }
    }
  },
  metadata: { vulnerabilities: { total: 1, critical: 0, high: 1, moderate: 0, low: 0, info: 0 } }
});

function npmExecution(stdout: string) {
  return {
    ok: true,
    data: {
      source: SECURITY_SCAN_CATALOG[0],
      commandSummary: "npm audit --json",
      cwd: "/repo/workbench",
      exitCode: stdout.includes('"total":0') ? 0 : 1,
      stdout,
      stderr: "",
      outputFormat: "json",
      stdoutTruncated: false,
      durationMs: 42,
      writesFiles: false,
      networkUsed: true,
      untrusted: true,
      safetyLabels: ["UNTRUSTED", "READ-ONLY SCAN", "NO WRITES", "NO REMEDIATION"]
    }
  };
}

function cargoTreeExecution() {
  return {
    ok: true,
    data: {
      source: SECURITY_SCAN_CATALOG[2],
      commandSummary: "cargo tree -i glib --target x86_64-unknown-linux-gnu",
      cwd: "/repo/workbench/src-tauri",
      exitCode: 0,
      stdout: "glib v0.18.5\n├── atk v0.18.2\n│   └── gtk v0.18.2",
      stderr: "",
      outputFormat: "text",
      stdoutTruncated: false,
      durationMs: 88,
      writesFiles: false,
      networkUsed: false,
      untrusted: true,
      safetyLabels: ["UNTRUSTED", "READ-ONLY SCAN", "NO WRITES", "NO REMEDIATION"]
    }
  };
}

function healthyDesktop() {
  mocks.isDesktopRuntime.mockReturnValue(true);
  mocks.checkBridgeHealth.mockResolvedValue({
    healthy: true,
    probeAttempted: true,
    probeOk: true,
    probeSourceId: "capabilities",
    nextActions: [],
    resolution: { status: "ready", bridgeMode: "read-only", repoRoot: "/repo" }
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(false);
  mocks.checkBridgeHealth.mockReset();
  mocks.runSecurityScanSource.mockReset();
});

describe("security scan model mapping", () => {
  it("maps npm audit JSON into untrusted live findings", () => {
    const findings = mapNpmAuditToFindings(NPM_AUDIT_JSON, "2026-06-21T00:00:00Z");
    expect(findings.length).toBe(1);
    const finding = findings[0];
    expect(finding.packageName).toBe("lodash");
    expect(finding.source).toBe("npm_audit");
    expect(finding.severity).toBe("high");
    expect(finding.status).toBe("open");
    expect(finding.trustedSource).toBe(false);
    expect(finding.needsHumanReview).toBe(true);
    expect(finding.fixAvailable).toBe(true);
  });

  it("reports a clean audit summary and no findings", () => {
    const clean = JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { total: 0, critical: 0, high: 0, moderate: 0, low: 0, info: 0 } } });
    expect(parseNpmAuditSummary(clean)?.total).toBe(0);
    expect(mapNpmAuditToFindings(clean, "x").length).toBe(0);
  });

  it("never lists a mutating command in the catalog", () => {
    for (const source of SECURITY_SCAN_CATALOG) {
      expect(source.readOnly).toBe(true);
      expect(source.displayCommand).not.toMatch(/install|update|fix|add |remove|publish/i);
    }
  });
});

describe("SecurityScanPanel — web mode", () => {
  it("refuses scans and shows manual instructions", () => {
    mocks.isDesktopRuntime.mockReturnValue(false);
    render(<SecurityScanPanel />);
    expect(screen.getByText(/WEB · MANUAL/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Desktop only/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Run the command above in a terminal/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /run scan/i })).toBeNull();
  });
});

describe("SecurityScanPanel — desktop mode", () => {
  it("renders a desktop npm audit scan result and maps live findings", async () => {
    healthyDesktop();
    mocks.runSecurityScanSource.mockResolvedValue(npmExecution(NPM_AUDIT_JSON));
    render(<SecurityScanPanel />);
    const card = screen.getByText("npm audit (JSON)").closest("article")!;
    const runButton = within(card).getByRole("button", { name: /run scan/i });
    await waitFor(() => expect(runButton).not.toBeDisabled());
    fireEvent.click(runButton);

    const result = await within(card).findByTestId("security-scan-result");
    expect(within(result).getByText("UNTRUSTED OUTPUT")).toBeInTheDocument();
    expect(within(result).getByText("NO REMEDIATION")).toBeInTheDocument();
    expect(within(result).getByText("lodash")).toBeInTheDocument();
    expect(within(result).getByText(/LIVE · npm audit/i)).toBeInTheDocument();
  });

  it("keeps Plan fix preview-only for a live finding and offers no auto-fix", async () => {
    healthyDesktop();
    mocks.runSecurityScanSource.mockResolvedValue(npmExecution(NPM_AUDIT_JSON));
    render(<SecurityScanPanel />);
    const card = screen.getByText("npm audit (JSON)").closest("article")!;
    const runButton = within(card).getByRole("button", { name: /run scan/i });
    await waitFor(() => expect(runButton).not.toBeDisabled());
    fireEvent.click(runButton);
    const planButton = await within(card).findByRole("button", { name: /plan fix \(preview\)/i });
    fireEvent.click(planButton);
    const plan = await within(card).findByTestId("security-fix-plan");
    expect(within(plan).getByText("UNTRUSTED UNTIL VERIFIED")).toBeInTheDocument();
    expect(within(plan).getAllByText("APPROVAL REQUIRED").length).toBeGreaterThan(0);
    expect(within(plan).getByText("NO WRITES")).toBeInTheDocument();
    // No control may apply, auto-fix, install, or update.
    expect(within(card).queryByRole("button", { name: /apply|fix now|auto-?fix|update now|audit fix|cargo update/i })).toBeNull();
  });

  it("renders cargo tree as dependency evidence, not a vulnerability scan", async () => {
    healthyDesktop();
    mocks.runSecurityScanSource.mockResolvedValue(cargoTreeExecution());
    render(<SecurityScanPanel />);
    const card = screen.getByText("cargo tree -i glib").closest("article")!;
    const runButton = within(card).getByRole("button", { name: /run scan/i });
    await waitFor(() => expect(runButton).not.toBeDisabled());
    fireEvent.click(runButton);
    const result = await within(card).findByTestId("security-scan-result");
    expect(within(result).getByText(/dependency-path evidence/i)).toBeInTheDocument();
    expect(within(result).queryByText(/LIVE · npm audit/i)).toBeNull();
  });

  it("renders a scan error safely without crashing", async () => {
    healthyDesktop();
    mocks.runSecurityScanSource.mockResolvedValue({
      ok: false,
      error: { code: "executable_not_found", message: "npm was not found on PATH" }
    });
    render(<SecurityScanPanel />);
    const card = screen.getByText("npm audit (JSON)").closest("article")!;
    const runButton = within(card).getByRole("button", { name: /run scan/i });
    await waitFor(() => expect(runButton).not.toBeDisabled());
    fireEvent.click(runButton);
    expect(await within(card).findByText("SCAN ERROR")).toBeInTheDocument();
    expect(within(card).getByText(/npm was not found on PATH/i)).toBeInTheDocument();
  });

  it("warns that npm audit may require the network", () => {
    healthyDesktop();
    render(<SecurityScanPanel />);
    expect(screen.getAllByText("MAY REQUIRE NETWORK").length).toBeGreaterThan(0);
  });
});

describe("security scan safety (source scan)", () => {
  it("introduces no browser network or shell primitive", async () => {
    const files = [
      "src/features/security/SecurityScanPanel.tsx",
      "src/data/security/security-model.ts",
      "src-tauri/src/bridge/security_scan.rs"
    ];
    const source = (await Promise.all(files.map((rel) => readFile(join(repoRoot, rel), "utf8")))).join("\n");
    for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /tauri-plugin-shell/, /Stdio::inherit/]) {
      expect(source).not.toMatch(forbidden);
    }
  });
});
