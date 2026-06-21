import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const widths = [1024, 1440];

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
  const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4174"], {
    cwd: root,
    stdio: "inherit"
  });

  try {
    await waitForServer("http://127.0.0.1:4174/");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
      await page.waitForSelector("#app");
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (overflowX) throw new Error(`Horizontal overflow detected at ${width}px`);
      const title = await page.textContent("h1");
      if (!title || !title.includes("RealForge")) {
        throw new Error(`Home screen did not render at ${width}px`);
      }
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
