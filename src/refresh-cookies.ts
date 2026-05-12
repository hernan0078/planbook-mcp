/**
 * refresh-cookies.ts
 * Extracts the authenticated api.planbook.com SESSION cookie from your real
 * Chrome browser profile — no login required, works instantly.
 *
 * Usage: node dist/refresh-cookies.js
 * Run whenever the MCP says "session expired".
 */

import { chromium } from "playwright";
import { writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const COOKIE_FILE = join(dirname(fileURLToPath(import.meta.url)), "../cookies.json");

// Common Chrome profile locations on macOS
const CHROME_PROFILES = [
  join(homedir(), "Library/Application Support/Google/Chrome/Default"),
  join(homedir(), "Library/Application Support/Google/Chrome/Profile 1"),
  join(homedir(), "Library/Application Support/Chromium/Default"),
  join(homedir(), "Library/Application Support/BraveSoftware/Brave-Browser/Default"),
];

const userDataDir = CHROME_PROFILES.find(p => existsSync(p))?.replace("/Default", "") ?? "";

if (!userDataDir) {
  console.error("Could not find Chrome profile directory. Make sure Chrome is installed.");
  process.exit(1);
}

console.log("Using Chrome profile:", userDataDir);
console.log("Opening Planbook tab to extract cookies...");

// Launch with the REAL Chrome profile — already authenticated
const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: "chrome",       // use installed Chrome, not Playwright's Chromium
  headless: false,         // must be non-headless for persistent context with Chrome
  args: ["--no-first-run", "--no-default-browser-check"],
});

const page = await ctx.newPage();

// Navigate to Planbook to make sure api.planbook.com cookies are set
await page.goto("https://app.planbook.com/plans", { waitUntil: "domcontentloaded", timeout: 15_000 })
  .catch(() => console.log("Navigation timeout — using existing cookies anyway"));

await page.waitForTimeout(2000); // let api.planbook.com cookies refresh

// Extract all planbook cookies
const allCookies = await ctx.cookies([
  "https://api.planbook.com",
  "https://app.planbook.com",
  "https://auth.planbook.com",
]);

const apiCookies = allCookies.filter(c => c.domain.includes("api.planbook.com"));
const session = apiCookies.find(c => c.name === "SESSION");

if (!session) {
  console.error("❌ No api.planbook.com SESSION cookie found. Make sure you're logged into Planbook in Chrome.");
  await ctx.close();
  process.exit(1);
}

console.log("api.planbook.com cookies:", apiCookies.map(c => c.name));
console.log("SESSION cookie length:", session.value.length);

writeFileSync(COOKIE_FILE, JSON.stringify(allCookies, null, 2));
console.log(`\n✅ Cookies saved to ${COOKIE_FILE}`);
console.log("The MCP will use these automatically. Re-run this script if it stops working.");

await ctx.close();
