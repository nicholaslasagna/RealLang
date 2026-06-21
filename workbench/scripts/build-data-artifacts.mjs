import * as esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [join(root, "src/data/legacy/register-globals.ts")],
  outfile: join(root, "legacy/js/data-bundle.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  logLevel: "info"
});

await esbuild.build({
  entryPoints: [join(root, "src/data/cli/cli-report-sources.ts")],
  outfile: join(root, "dist-node/cli-report-sources.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node20"],
  logLevel: "info"
});

console.log("Built legacy data bundle and Node CLI allowlist artifacts.");
