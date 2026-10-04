/**
 * Headless UI verification against live staging.
 *
 * Uses the Chrome already installed on this machine via puppeteer-core, with a
 * throwaway temp profile. It cannot see the operator's tabs, cookies, history
 * or saved logins. Point BASE_URL at another origin to check that instead.
 *
 * Usage:
 *   node scripts/browser-check.mjs                     # smoke walk of public + auth pages
 *   BASE_URL=https://host node scripts/browser-check.mjs
 *
 * Exit code 0 = every check passed. Non-zero = at least one failed.
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "https://comfortable-youth-staging.up.railway.app";
const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.CHROME_PATH,
].filter(Boolean);

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  // A low-end phone on congested mobile data is the client-stated target
  // environment, so every page is also checked at a small viewport.
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
};

const results = [];
const consoleErrors = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? `  ${detail}` : ""}`);
}

function resolveChrome() {
  for (const p of CHROME_PATHS) if (existsSync(p)) return p;
  throw new Error("No Chrome or Edge binary found. Set CHROME_PATH.");
}

async function withPage(viewport, fn) {
  const profile = mkdtempSync(join(tmpdir(), "likas-ui-"));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      headless: true,
      userDataDir: profile,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setViewport(viewport);
    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
    });
    page.on("pageerror", err => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`));
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

/** True when the rendered text matches, and nothing looks like an error screen. */
async function assertRenders(page, name, { expect, forbid = [] }) {
  const text = await page.evaluate(() => document.body.innerText);
  if (expect && !expect.every(e => text.includes(e))) {
    record(name, false, `missing: ${expect.filter(e => !text.includes(e)).join(", ")}`);
    return false;
  }
  const hit = forbid.find(f => text.includes(f));
  if (hit) {
    record(name, false, `error text on page: "${hit}"`);
    return false;
  }
  record(name, true);
  return true;
}

async function main() {
  console.log(`Browser check against ${BASE_URL}\n`);
  console.log("Public pages, desktop:");
  await withPage(VIEWPORTS.desktop, async page => {
    for (const [path, expect] of [
      ["/", []],
      ["/login", ["PROJECT LIKAS"]],
      ["/register", ["PROJECT LIKAS"]],
      ["/recover", ["PROJECT LIKAS"]],
      ["/citizen", []],
    ]) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle2", timeout: 60000 });
      await assertRenders(page, `GET ${path}`, {
        expect,
        // tRPC surfaces these in the DOM when a route or query fails.
        forbid: ["Something went wrong", "No procedure found", "Unexpected token"],
      });
    }
  });

  console.log("\nChange password screen (unauthenticated must redirect):");
  await withPage(VIEWPORTS.desktop, async page => {
    await page.goto(`${BASE_URL}/account/security`, { waitUntil: "networkidle2", timeout: 60000 });
    const url = page.url();
    const text = await page.evaluate(() => document.body.innerText);
    const guarded = url.includes("/login") || text.includes("PROJECT LIKAS");
    const leaked = text.includes("Current password") || text.includes("New password");
    record(
      "GET /account/security redirects when signed out",
      guarded,
      `url=${url.replace(BASE_URL, "") || "/"}`,
    );
    record(
      "no password form exposed while signed out",
      !leaked,
      leaked ? "FORM IS VISIBLE TO UNAUTHENTICATED VISITORS" : "",
    );
  });

  console.log("\nMobile viewport, low-end phone target:");
  await withPage(VIEWPORTS.mobile, async page => {
    for (const path of ["/login", "/register"]) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle2", timeout: 60000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      const text = await page.evaluate(() => document.body.innerText);
      record(
        `GET ${path} no horizontal overflow at 390px`,
        !overflow && !text.includes("Something went wrong"),
        overflow ? "page scrolls sideways" : "",
      );
    }
  });

  console.log(
    `\nConsole errors captured: ${consoleErrors.length}`,
  );
  for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log(`  - ${e}`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error("browser-check failed to run:", err);
  process.exit(2);
});
