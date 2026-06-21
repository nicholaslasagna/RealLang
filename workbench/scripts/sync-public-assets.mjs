import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets");
const dest = join(root, "public", "assets");

if (!existsSync(join(root, "public"))) mkdirSync(join(root, "public"), { recursive: true });
cpSync(source, dest, { recursive: true, force: true });
