// One-off: render the static Open Graph image to public/og.png.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const html = fileURLToPath(new URL("./og-image.html", import.meta.url));
const out = fileURLToPath(new URL("../public/og.png", import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto("file://" + html);
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
