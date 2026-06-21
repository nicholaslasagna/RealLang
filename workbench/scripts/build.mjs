import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
execFileSync("npm", ["run", "build:app"], { cwd: root, stdio: "inherit" });

const index = await readFile(join(dist, "index.html"), "utf8");
if (/https?:\/\//i.test(index)) throw new Error("Workbench entrypoint must not load remote assets");

await mkdir(join(dist, "src", "data"), { recursive: true });
await Promise.all([
  cp(join(root, "src", "data"), join(dist, "src", "data"), { recursive: true }),
  cp(join(root, "legacy"), join(dist, "legacy"), { recursive: true }),
  cp(join(root, "tools"), join(dist, "tools"), { recursive: true })
]);

await writeFile(
  join(dist, "prototype-manifest.json"),
  `${JSON.stringify(
    {
      prototype: "RealForge Workbench",
      version: "0.5.0",
      ui: "react-vite",
      backendIntegration: false,
      dataContracts: true,
      reportAdapters: true,
      reportImport: true,
      cliBridgeCatalog: true
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log("Built offline Workbench in workbench/dist/");
