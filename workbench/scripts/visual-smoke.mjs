import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const widths = [1024, 1280, 1440];

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Dev server did not become ready: ${url}`);
}

async function run() {
  const preview = spawn(
    process.execPath,
    [join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "4174"],
    {
    cwd: root,
    stdio: "inherit"
    }
  );

  try {
    await waitForServer("http://127.0.0.1:4174/");
    const { chromium } = await import("playwright");
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Executable doesn't exist")) throw error;
      browser = await chromium.launch({ channel: "chrome", headless: true });
    }

    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(() => {
        const sources = [
          { id: "capabilities", label: "Capability registry", description: "mock", displayCommand: "realforge capabilities --json", detectType: "capability_registry", readOnly: true },
          { id: "slash", label: "Slash registry", description: "mock", displayCommand: "realforge slash --json", detectType: "slash_command_registry", readOnly: true },
          { id: "settings-doctor", label: "Settings doctor", description: "mock", displayCommand: "realforge settings doctor --json", detectType: "settings_summary", readOnly: true }
        ];
        const resolution = {
          status: "ready",
          repoRoot: "C:\\RealLang",
          workbenchPath: "C:\\RealLang\\workbench",
          pythonPath: "C:\\RealLang\\.venv\\Scripts\\python.exe",
          discoveryMethod: "visual_mock",
          errors: [],
          warnings: [],
          bridgeMode: "read-only",
          platform: "windows",
          arch: "x86_64",
          supportedSources: sources
        };
        window.__TAURI_INTERNALS__ = {
          invoke: async (command, args = {}) => {
            if (command === "check_bridge_health") {
              return { resolution, healthy: true, probeAttempted: true, probeOk: true, probeSourceId: "capabilities", nextActions: [] };
            }
            if (command === "list_readonly_report_sources") return sources;
            if (command === "get_workspace_resolution") return resolution;
            if (command === "get_runtime_info") {
              return { runtime: "desktop", appName: "RealForge Workbench", workbenchVersion: "0.16.0", platform: "windows", arch: "x86_64", bridgeMode: "read-only" };
            }
            if (command === "get_bridge_capabilities") {
              return { bridgeMode: "read-only", readOnly: true, writes: false, network: false, shellExecution: false, cliSpawn: true, approvalGatedWrites: false, approvalGatedDryRun: true, approvedDryRunActionCount: 2, metadataOnly: false };
            }
            if (command === "get_update_status") {
              return {
                state: "not_configured", configured: false, currentVersion: "0.16.0", platform: "windows", arch: "x86_64", channel: "stable",
                configuration: { configured: false, channel: "stable", endpointConfigured: false, endpointUrl: null, publicKeyConfigured: false, signingRequired: true, installAllowed: false, disabledReason: "Signed update endpoint and public key are not configured for this build." },
                latestVersion: null, releaseNotes: null, message: "Signed update endpoint and public key are not configured for this build.",
                safetyNotes: ["Only signed update packages may be installed."], releaseChecklist: []
              };
            }
            if (command === "run_approved_dry_run_action") {
              return {
                ok: true,
                data: {
                  actionId: "realc-check-hello-example",
                  title: "Check the fixed hello.real example",
                  commandSummary: "realc examples/hello.real --check",
                  relativePath: "examples/hello.real",
                  workspacePath: "C:\\RealLang",
                  exitCode: 0,
                  passed: true,
                  stdout: "check ok",
                  stderr: "",
                  durationMs: 16,
                  writesFiles: false,
                  networkRequired: false,
                  untrusted: true,
                  safetyLabels: ["UNTRUSTED", "NO WRITES", "NETWORK OFF"]
                }
              };
            }
            if (command === "load_approval_audit_log") {
              return { ok: true, data: { version: 1, savedAt: "1750521600", entries: [] } };
            }
            if (command === "save_approval_audit_log") {
              return {
                ok: true,
                data: { version: 1, savedAt: "1750521601", entries: args.entries ?? [] },
                droppedEntries: 0
              };
            }
            if (command === "clear_approval_audit_log") return { ok: true };
            throw new Error(`visual mock does not implement ${command}`);
          }
        };
      });
      const runtimeErrors = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(message.text());
      });
      await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
      await page.waitForSelector("#app");
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (overflowX) throw new Error(`Horizontal overflow detected at ${width}px`);
      const title = await page.textContent("h1");
      if (!title || !title.includes("RealForge")) {
        throw new Error(`Home screen did not render at ${width}px`);
      }

      const overflows = () =>
        page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);

      // 0.16: verify Security, Reports, and Settings (About) render without overflow.
      for (const [navName, selector] of [
        ["Security", ".security-hero"],
        ["Reports", ".import-banner"],
        ["Settings", '[data-testid="about-panel"]']
      ]) {
        await page.getByRole("button", { name: navName, exact: true }).click();
        await page.waitForSelector(selector);
        if (await overflows()) throw new Error(`${navName} horizontal overflow detected at ${width}px`);
      }

      await page.getByRole("button", { name: "Workbench", exact: true }).click();
      await page.waitForSelector('[data-testid="safe-command-composer"]');
      await page.getByRole("button", { name: "Check the fixed hello.real example", exact: true }).click();
      await page.getByRole("button", { name: "Review approval", exact: true }).click();
      await page.waitForSelector('[data-testid="approval-panel"]');
      const runApprovedCheck = page.getByRole("button", { name: "Run approved check", exact: true });
      if (await runApprovedCheck.isEnabled()) throw new Error(`Approval execution started enabled at ${width}px`);
      await page.getByRole("checkbox", { name: /I understand this runs a local dry-run\/check command/i }).check();
      await runApprovedCheck.click();
      await page.waitForSelector('[data-testid="approved-dry-run-result"]');
      await page.waitForSelector('[data-testid="recent-approval-runs"] .approval-audit-entry');
      const workbenchOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (workbenchOverflow) throw new Error(`Workbench horizontal overflow detected at ${width}px`);

      await page.getByRole("button", { name: "Commands" }).click();
      await page.waitForSelector('[data-testid="command-action-detail"]');
      const paletteOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (paletteOverflow) throw new Error(`Command palette horizontal overflow detected at ${width}px`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Reports", exact: true }).click();
      await page.waitForSelector('[data-testid="approval-audit-log"] .approval-audit-entry');
      if (await overflows()) throw new Error(`Approval log horizontal overflow detected at ${width}px`);
      if (runtimeErrors.length) throw new Error(`Browser errors at ${width}px: ${runtimeErrors.join(" | ")}`);
      console.log(`visual smoke OK at ${width}px`);
      await page.close();
    }

    await browser.close();
  } finally {
    preview.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
