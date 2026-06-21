import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import App from "../../src/App";
import { useWorkbenchStore } from "../../src/state/workbench-store";
import { securityFindings } from "../../src/data/security/security-fixtures";
import { buildFixPlan, summarizeFindings, type SecurityFinding } from "../../src/data/security/security-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

afterEach(() => {
  cleanup();
});

function resetStore(screenName: string) {
  useWorkbenchStore.setState({
    screen: screenName as never,
    settingsSection: "general",
    staffPreview: false,
    commandQuery: "",
    sidebarOpen: false,
    operationStatus: "Idle · ready",
    lastCommand: "none · prototype ready",
    stagedTask: "",
    composedActionId: "repair-diagnostic-dry-run",
    importRaw: "",
    importType: "auto",
    importPreview: null,
    paletteOpen: false,
    toast: null,
    desktopLoadStatus: "idle",
    desktopLoadSourceId: null,
    desktopLoadError: null,
    approvalAuditEntries: [],
    approvalAuditHydrated: false,
    approvalAuditStorageStatus: "idle",
    approvalAuditStorageWarning: null
  });
}

describe("Security Center model", () => {
  it("summarizes the real fixtures with correct counts", () => {
    const summary = summarizeFindings(securityFindings);
    expect(summary.total).toBe(securityFindings.length);
    expect(summary.open + summary.resolved + summary.blocked + summary.deferred + summary.ignored).toBe(summary.total);
    expect(summary.resolved).toBeGreaterThanOrEqual(1);
    expect(summary.blocked).toBe(1);
    expect(summary.open).toBe(0);
    // No open findings but one blocked-upstream -> honest "blocked" posture, never "pass".
    expect(summary.status).toBe("blocked");
  });

  it("marks esbuild resolved and glib blocked (never fixed)", () => {
    const esbuild = securityFindings.find((f) => f.packageName === "esbuild");
    const glib = securityFindings.find((f) => f.packageName === "glib");
    expect(esbuild?.status).toBe("resolved");
    expect(esbuild?.patchedVersion).toBe("0.28.1");
    expect(glib?.status).toBe("blocked");
    expect(glib?.fixAvailable).toBe(false);
    expect(glib?.fixBlockedReason).toMatch(/gtk|tauri/i);
    expect(glib?.status).not.toBe("resolved");
  });

  it("builds preview-only, untrusted, approval-required fix plans", () => {
    const glib = securityFindings.find((f) => f.packageName === "glib")!;
    const esbuild = securityFindings.find((f) => f.packageName === "esbuild")!;
    const glibPlan = buildFixPlan(glib);
    const esbuildPlan = buildFixPlan(esbuild);

    for (const plan of [glibPlan, esbuildPlan]) {
      expect(plan.untrusted).toBe(true);
      expect(plan.approvalRequired).toBe(true);
      expect(plan.writesFiles).toBe(false);
      expect(plan.generatedByAi).toBe(false);
    }
    expect(esbuildPlan.executionStatus).toBe("preview_only");
    expect(glibPlan.executionStatus).toBe("blocked");
    expect(glibPlan.title).toMatch(/track/i);

    const openFinding: SecurityFinding = { ...glib, status: "open", fixAvailable: true };
    const openPlan = buildFixPlan(openFinding);
    expect(openPlan.executionStatus).toBe("approval_required");
    expect(openPlan.writesFiles).toBe(false);
  });
});

describe("Security Center screen", () => {
  it("renders the security posture and findings", () => {
    resetStore("security");
    render(<App />);
    expect(screen.getByText("Security review")).toBeInTheDocument();
    expect(screen.getByText("SECURITY POSTURE")).toBeInTheDocument();
    const list = screen.getByLabelText("Security findings");
    expect(within(list).getByText("esbuild")).toBeInTheDocument();
    expect(within(list).getByText("glib")).toBeInTheDocument();
  });

  it("shows esbuild resolved with a review action, not an auto-fix", () => {
    resetStore("security");
    render(<App />);
    // esbuild is the first finding and selected by default.
    const detail = screen.getByLabelText("Finding detail");
    expect(within(detail).getByRole("heading", { name: "esbuild" })).toBeInTheDocument();
    expect(within(detail).getAllByText("RESOLVED").length).toBeGreaterThan(0);
    expect(within(detail).getByRole("button", { name: /review validation/i })).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /apply|fix now|auto-?fix/i })).toBeNull();
  });

  it("shows glib as blocked upstream and never fixed, with no unsafe auto-fix", () => {
    resetStore("security");
    render(<App />);
    const list = screen.getByLabelText("Security findings");
    fireEvent.click(within(list).getByText("glib").closest("button")!);
    const detail = screen.getByLabelText("Finding detail");
    expect(within(detail).getAllByText("BLOCKED UPSTREAM").length).toBeGreaterThan(0);
    expect(within(detail).queryByText("RESOLVED")).toBeNull();
    expect(within(detail).getByText(/Why it is blocked/i)).toBeInTheDocument();
    // The only remediation control is a tracking plan, never an apply/auto-fix.
    expect(within(detail).getByRole("button", { name: /create tracking plan/i })).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /apply|fix now|auto-?fix|update now/i })).toBeNull();
  });

  it("Plan Fix composes a preview-only, untrusted, approval-required plan", () => {
    resetStore("security");
    render(<App />);
    const detail = screen.getByLabelText("Finding detail");
    fireEvent.click(within(detail).getByRole("button", { name: /review validation/i }));
    const plan = screen.getByTestId("security-fix-plan");
    expect(within(plan).getByText("PREVIEW ONLY")).toBeInTheDocument();
    expect(within(plan).getByText("UNTRUSTED UNTIL VERIFIED")).toBeInTheDocument();
    expect(within(plan).getByText("APPROVAL REQUIRED")).toBeInTheDocument();
    expect(within(plan).getByText("NO WRITES")).toBeInTheDocument();
    expect(within(plan).getAllByText("NOT EXECUTED").length).toBeGreaterThan(0);
  });

  it("exposes the deep review surface as future/preview only", () => {
    resetStore("security");
    render(<App />);
    expect(screen.getByText("DEEP SECURITY REVIEW")).toBeInTheDocument();
    expect(screen.getByText("READ-ONLY SCAN BRIDGE")).toBeInTheDocument();
    expect(screen.getAllByText("NO REMEDIATION").length).toBeGreaterThan(0);
  });
});

describe("Security Center safety (source scan)", () => {
  it("introduces no network, shell, IPC-write, or file-write primitive", async () => {
    const files = [
      "src/data/security/security-model.ts",
      "src/data/security/security-fixtures.ts",
      "src/features/security/SecurityScreen.tsx",
      "src/features/security/DeepSecurityReviewCard.tsx"
    ];
    const source = (await Promise.all(files.map((rel) => readFile(join(repoRoot, rel), "utf8")))).join("\n");
    for (const forbidden of [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /child_process/,
      /\binvoke\s*\(/,
      /run_approved_dry_run/,
      /writeFile/,
      /loadSource\s*\(/,
      /tauri-plugin-shell/
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });
});
