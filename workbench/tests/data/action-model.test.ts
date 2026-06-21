import { describe, expect, it } from "vitest";
import {
  commandActionDefinitions,
  composeActionPlan,
  getActionForSlashCommand,
  validateActionCatalog
} from "../../src/composer/action-model";
import { cliReportSources } from "../../src/data/cli/cli-report-sources";
import { getWorkbenchData } from "../../src/data/workbench-data";

const webContext = {
  runtime: "web" as const,
  bridgeHealthy: false,
  staffMode: false,
  allowlistedSourceIds: cliReportSources.SOURCE_IDS
};

const desktopContext = {
  runtime: "desktop" as const,
  bridgeHealthy: true,
  staffMode: true,
  allowlistedSourceIds: cliReportSources.SOURCE_IDS
};

describe("safe command composer model", () => {
  it("defines a valid typed catalog", () => {
    expect(validateActionCatalog()).toEqual([]);
    expect(commandActionDefinitions.length).toBeGreaterThan(10);
    expect(commandActionDefinitions.every((action) => Boolean(action.id && action.category && action.nextSafeStep))).toBe(true);
  });

  it("maps read-only actions only to the three fixed source IDs", () => {
    const mapped = commandActionDefinitions.filter((action) => action.fixedSourceId);
    expect(mapped.map((action) => action.fixedSourceId).sort()).toEqual([...cliReportSources.SOURCE_IDS].sort());
    expect(mapped.every((action) => !action.writesFiles && !action.networkRequired && !action.destructive)).toBe(true);
  });

  it("makes fixed read-only sources available only through a healthy desktop bridge", () => {
    expect(composeActionPlan("load-capabilities", webContext).currentExecutionStatus).toBe("unsupported");
    const desktop = composeActionPlan("load-capabilities", desktopContext);
    expect(desktop.currentExecutionStatus).toBe("read_only_available");
    expect(desktop.canLoadNow).toBe(true);
    expect(desktop.fixedSourceId).toBe("capabilities");
  });

  it("exposes exactly one fixed no-write action as approval-required on healthy desktop", () => {
    const approved = commandActionDefinitions.filter((action) => action.approvedDryRunActionId);
    expect(approved).toHaveLength(1);
    expect(approved[0].approvedDryRunActionId).toBe("realc-check-hello-example");
    expect(approved[0].fixedArgvTemplate).toEqual(["realc", "examples/hello.real", "--check"]);
    expect(approved[0].allowedInputs).toEqual(["approvalAcknowledged: true"]);
    expect(approved[0].writesFiles).toBe(false);
    expect(approved[0].networkRequired).toBe(false);
    expect(composeActionPlan(approved[0].id, webContext).currentExecutionStatus).toBe("unsupported");
    const desktop = composeActionPlan(approved[0].id, desktopContext);
    expect(desktop.currentExecutionStatus).toBe("approval_required");
    expect(desktop.canRequestApproval).toBe(true);
  });

  it("keeps every write or destructive action behind the future approval bridge", () => {
    const writeActions = commandActionDefinitions.filter((action) => action.writesFiles || action.destructive);
    expect(writeActions.length).toBeGreaterThan(0);
    for (const action of writeActions) {
      const composed = composeActionPlan(action.id, desktopContext);
      expect(composed.currentExecutionStatus).toBe("approval_bridge_required");
      expect(composed.canLoadNow).toBe(false);
      expect(composed.safetyLabels).toContain("APPROVAL BRIDGE REQUIRED");
    }
  });

  it("keeps staff-only previews gated while Staff Mode is off", () => {
    const gated = composeActionPlan("staff-improvement-dry-run", webContext);
    expect(gated.staffRequired).toBe(true);
    expect(gated.currentExecutionStatus).toBe("unsupported");
    expect(gated.runtimeWarnings.join(" ")).toMatch(/Staff Mode is off/);
  });

  it("contains fixed display tokens, never arbitrary argument or shell-string fields", () => {
    for (const action of commandActionDefinitions) {
      expect(action).not.toHaveProperty("args");
      expect(action).not.toHaveProperty("commandString");
      expect(action).not.toHaveProperty("shell");
      for (const token of action.proposedArgvPreview ?? []) {
        expect(token).not.toMatch(/[;|\n\r]/);
        expect(token).not.toContain("&&");
      }
    }
  });

  it("gives every registered slash command a structured action preview", () => {
    for (const command of getWorkbenchData().commands) {
      expect(getActionForSlashCommand(command.command), command.command).not.toBeNull();
    }
    expect(getActionForSlashCommand("/leaderboard")?.writesFiles).toBe(false);
    expect(getActionForSlashCommand("/engine scan")?.writesFiles).toBe(false);
    expect(getActionForSlashCommand("/ask")?.domain).toBe("core");
  });
});
