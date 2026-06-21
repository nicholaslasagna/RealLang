import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "src/data/fixtures/capabilities.json",
  "src/data/fixtures/doctor-status.json",
  "src/data/fixtures/settings.json",
  "src/data/fixtures/skill-benchmark.json",
  "src/data/fixtures/slash-commands.json",
  "src/data/fixtures/studio-reports.json",
  "src/data/fixtures/update-bundle.json",
  "src/data/fixtures/index.ts"
];

for (const relativePath of required) {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(`Missing fixture source: ${relativePath}`);
  }
}

console.log("Fixture JSON sources present.");
