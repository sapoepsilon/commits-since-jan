// Renders a user's share card with the page's own client-side PNG renderer.
// node scripts/card.mjs <baseUrl> <login> <out.png> [rangeQuery] [landscape|post|story]
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [base, login, out, query = "", format = "landscape"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(`${base}/u/${encodeURIComponent(login)}${query}`, { waitUntil: "networkidle" });
await page.waitForSelector("#result:not([hidden])");
const dataUrl = await page.evaluate((f) => window.__drawCardDataUrl(f), format);
writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
await browser.close();
console.log("wrote", out);
