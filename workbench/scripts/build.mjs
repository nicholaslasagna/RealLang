import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const required = [
  "index.html",
  "styles.css",
  "js/mock-data.js",
  "js/components.js",
  "js/app.js",
  "src/data/contracts/report-contracts.d.ts",
  "src/data/fixtures/fixture-bundle.generated.js",
  "src/data/status.js",
  "src/data/adapters/report-adapters.js",
  "src/data/viewModels/workbench-view-models.js",
  "src/data/import/report-import.js",
  "assets/icons/LICENSE"
];

for (const relativePath of required) {
  const content = await readFile(join(root, relativePath));
  if (content.length === 0) throw new Error(`Required prototype file is empty: ${relativePath}`);
}

const index = await readFile(join(root, "index.html"), "utf8");
if (/https?:\/\//i.test(index)) throw new Error("Workbench entrypoint must not load remote assets");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  cp(join(root, "index.html"), join(dist, "index.html")),
  cp(join(root, "styles.css"), join(dist, "styles.css")),
  cp(join(root, "js"), join(dist, "js"), { recursive: true }),
  cp(join(root, "src"), join(dist, "src"), { recursive: true }),
  cp(join(root, "assets"), join(dist, "assets"), { recursive: true })
]);
await writeFile(join(dist, "prototype-manifest.json"), `${JSON.stringify({ prototype: "RealForge Workbench", version: "0.3.1", backendIntegration: false, dataContracts: true, reportAdapters: true, reportImport: true }, null, 2)}\n`, "utf8");

console.log("Built offline static prototype in workbench/dist/");
