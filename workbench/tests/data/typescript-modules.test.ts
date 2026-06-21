import { describe, expect, it } from "vitest";
import { cliReportSources } from "../../src/data/cli/cli-report-sources";
import { fixtureBundle } from "../../src/data/fixtures";
import { reportImport } from "../../src/data/import/report-import";
import { reportAdapters } from "../../src/data/adapters/report-adapters";
import { createFixtureViewModels } from "../../src/data/view-models/workbench-view-models";
import { getWorkbenchData } from "../../src/data/workbench-data";

describe("TypeScript data modules", () => {
  it("loads fixture bundle and adapters without globalThis bootstrap", () => {
    const capability = reportAdapters.adaptCapabilityRegistry(fixtureBundle.capabilities);
    expect(capability.data.capabilities.length).toBeGreaterThan(0);
    const models = createFixtureViewModels(fixtureBundle, { staffMode: false });
    expect(models.capabilities.length).toBeGreaterThan(0);
    expect(getWorkbenchData().navigation.length).toBe(15);
  });

  it("preserves import trust downgrade regression", () => {
    const preview = reportImport.parseAndAdapt(JSON.stringify({ untrusted: false, provider: "mock" }), "auto", {
      staffMode: false
    });
    expect(preview.ok).toBe(true);
    expect(preview.untrusted).toBe(true);
    expect(preview.safetyLabels).toContain("UNTRUSTED");
  });

  it("keeps CLI catalog read-only with fixed argv", () => {
    for (const source of cliReportSources.SOURCES) {
      expect(cliReportSources.isReadOnlySource(source)).toBe(true);
      expect(source.argv.every((token) => typeof token === "string")).toBe(true);
    }
  });

  it("typed import modules omit @ts-nocheck", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const root = join(import.meta.dirname, "../..");
    for (const rel of [
      "src/data/cli/cli-report-sources.ts",
      "src/data/import/report-import.ts",
      "src/data/view-models/workbench-view-models.ts"
    ]) {
      const source = await readFile(join(root, rel), "utf8");
      expect(source).not.toMatch(/@ts-nocheck/);
    }
  });

  it("claimed VALIDATED surfaces as claimedValidated only", () => {
    const preview = reportImport.parseAndAdapt(
      JSON.stringify({ safety_labels: ["VALIDATED"], status: "VALIDATED", capabilities: [] }),
      "capability_registry",
      { staffMode: false }
    );
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.claimedValidated).toBe(true);
      expect(preview.safetyLabels).not.toContain("VALIDATED");
      expect(preview.untrusted).toBe(true);
    }
  });
});
