import { describe, expect, it } from "vitest";
import { ensureMockData } from "../../src/data/workbench-data";
import { filterCommands } from "../../src/state/workbench-store";

ensureMockData();

describe("command palette data", () => {
  it("filters slash commands by domain query", () => {
    const results = filterCommands("skill-bench");
    expect(results.some((entry) => entry.command === "/skill-bench")).toBe(true);
    expect(
      results.every(
        (entry) =>
          entry.command.includes("skill-bench") ||
          `${entry.domain} ${entry.description}`.toLowerCase().includes("skill-bench")
      )
    ).toBe(true);
  });
});
