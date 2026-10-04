/**
 * End-to-end verification of the account security screen against live staging.
 *
 * Registers a throwaway account through the public UI, signs in, then exercises
 * the change-password form for real: a wrong current password, then a correct
 * one, then a fresh sign-in with the new password to prove the change actually
 * persisted rather than only looking like it did.
 *
 * Uses a throwaway Chrome profile. It cannot see the operator's tabs, cookies,
 * history or logins, and it never touches a real resident or staff account.
 *
 * Usage:  node scripts/verify-change-password.mjs
 * Exit 0 = every check passed.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "https://comfortable-youth-staging.up.railway.app";
const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const stamp = Date.now().toString(36);
// Registration is Gmail-only (OQ 4), enforced client-side with an inline hint.
// This address is random and unreachable, so nothing can be delivered to it and
// no real mailbox is involved. The account is deleted in the cleanup session.
const EMAIL = `likas.uicheck.${stamp}@gmail.com`;
const FIRST_PASSWORD = `Check-${stamp}-alpha`;
const SECOND_PASSWORD = `Check-${stamp}-bravo`;
const WRONG_PASSWORD = `Wrong-${stamp}-charlie`;

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? `  ${detail}` : ""}`);
}

const profile = mkdtempSync(join(tmpdir(), "likas-e2e-"));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const consoleErrors = [];

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on("console", m => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", e => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));
  return page;
}

const bodyText = page => page.evaluate(() => document.body.innerText);

/** Fill by the autocomplete token, which is what the markup actually declares. */
async function fill(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 20000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value, { delay: 8 });
}

async function signIn(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  await fill(page, 'input[autocomplete="email"]', email);
  await fill(page, 'input[autocomplete="current-password"]', password);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  ]);
  await new Promise(r => setTimeout(r, 2500));
}

try {
  console.log(`End-to-end check against ${BASE_URL}`);
  console.log(`Throwaway account: ${EMAIL}\n`);

  // ---- 1. Register through the public UI -------------------------------------
  console.log("Register a throwaway citizen account:");
  let page = await newPage();

  // Assert on the API response, not on the absence of words in the page. An
  // earlier version of this script checked for "no error text", which passed
  // while the account sat in the approval queue unable to sign in.
  let registerResult = null;
  page.on("response", async res => {
    if (!/localAuth\.register/.test(res.url())) return;
    try {
      const parsed = JSON.parse(await res.text());
      registerResult = parsed?.[0]?.result?.data?.json ?? parsed?.[0]?.error?.json ?? null;
    } catch {
      registerResult = { parseError: true };
    }
  });

  await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle2", timeout: 60000 });

  await fill(page, 'input[autocomplete="given-name"]', "Uicheck");
  await fill(page, 'input[autocomplete="family-name"]', "Resident");
  await fill(page, 'input[autocomplete="street-address"]', "123 Test Street, Pateros");
  await fill(page, 'input[autocomplete="off"]', "30");
  await fill(page, 'input[autocomplete="tel-national"]', "09171234567");
  await fill(page, 'input[autocomplete="email"]', EMAIL);
  await fill(page, 'input[autocomplete="new-password"]', FIRST_PASSWORD);

  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 5000));

  // The register response carries no row id; it echoes the email and hands back
  // an approval token. That echo is the proof the account was created.
  record(
    "register created the account",
    registerResult?.email === EMAIL && typeof registerResult?.approvalToken === "string",
    `email=${registerResult?.email} token=${registerResult?.approvalToken ? "yes" : "no"}`,
  );
  record(
    "registration reports whether approval is required",
    typeof registerResult?.approvalRequired === "boolean",
    `approvalRequired=${registerResult?.approvalRequired}`,
  );
  record(
    "registration did not require a Valid ID",
    registerResult?.idDocumentId === null,
    `idDocumentId=${JSON.stringify(registerResult?.idDocumentId)}`,
  );

  // A self-registered citizen is created PENDING and login refuses PENDING
  // (routers.ts:884). Surfaced as a skip, not a silent pass.
  if (registerResult?.approvalRequired) {
    console.log(
      `\n  SKIP: account is ${await page
        .evaluate(() => document.body.innerText)
        .then(t => (t.match(/waiting for approval|approval/i) ? "PENDING" : "unknown"))}` +
        " and login refuses PENDING accounts, so no session can be created.",
    );
    console.log(
      "  The change-password checks need an APPROVED account. Promote this one,",
    );
    console.log(`  then re-run: ${EMAIL}`);
    record("signed in with the new account", false, "BLOCKED: account is PENDING");
    await page.close();
    console.log(`\nAccount to promote: ${EMAIL}`);
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
    process.exit(3);
  }
  await page.close();

  // ---- 2. Sign in ------------------------------------------------------------
  console.log("\nSign in:");
  page = await newPage();
  await signIn(page, EMAIL, FIRST_PASSWORD);
  text = await bodyText(page);
  const signedIn = !page.url().includes("/login");
  record("signed in with the new account", signedIn, `url=${new URL(page.url()).pathname}`);
  if (!signedIn) {
    console.log("\n    cannot continue without a session");
    console.log(`    page said: ${text.slice(0, 300).replace(/\n/g, " ")}`);
    throw new Error("no session");
  }

  // ---- 3. The change-password screen renders ---------------------------------
  console.log("\nChange password screen:");
  await page.goto(`${BASE_URL}/account/security`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  text = await bodyText(page);

  record("screen renders the three password fields", /Current password/i.test(text) && /New password/i.test(text) && /Confirm new password/i.test(text));
  record("screen names the signed-in account", text.includes(EMAIL), EMAIL);
  record("no error text on first paint", !/went wrong|unexpected|no procedure/i.test(text));

  // ---- 4. Wrong current password shows the mapped message --------------------
  console.log("\nWrong current password:");
  await fill(page, 'input[autocomplete="current-password"]', WRONG_PASSWORD);
  await fill(page, 'input[autocomplete="new-password"]', SECOND_PASSWORD);
  await fill(page, 'input[autocomplete="new-password"]:not(:first-of-type)', SECOND_PASSWORD).catch(
    () => {},
  );
  // Two new-password inputs exist; fill the second explicitly by DOM order.
  await page.evaluate(v => {
    const inputs = [...document.querySelectorAll('input[autocomplete="new-password"]')];
    const confirm = inputs[inputs.length - 1];
    if (!confirm) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(confirm, v);
    confirm.dispatchEvent(new Event("input", { bubbles: true }));
  }, SECOND_PASSWORD);

  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 4000));
  text = await bodyText(page);
  record(
    "wrong current password shows a specific message, not a generic failure",
    /current password is incorrect/i.test(text),
    /correct/i.test(text) ? "" : `saw: ${text.slice(0, 200).replace(/\n/g, " ")}`,
  );
  record(
    "wrong password did not clear the form into a success state",
    !/has been changed/i.test(text),
  );

  // ---- 5. Correct current password succeeds ----------------------------------
  console.log("\nCorrect current password:");
  await fill(page, 'input[autocomplete="current-password"]', FIRST_PASSWORD);
  await page.evaluate(v => {
    const inputs = [...document.querySelectorAll('input[autocomplete="new-password"]')];
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    for (const el of inputs) {
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, SECOND_PASSWORD);

  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 5000));
  text = await bodyText(page);
  record("success state shown after the change", /has been changed/i.test(text));
  record(
    "password fields were emptied after success",
    await page.evaluate(
      () =>
        [...document.querySelectorAll('input[type="password"]')].every(i => i.value === ""),
    ),
  );
  await page.close();

  // ---- 6. Prove the change actually persisted --------------------------------
  console.log("\nSign in again with the new password:");
  page = await newPage();
  await signIn(page, EMAIL, SECOND_PASSWORD);
  const newWorks = !page.url().includes("/login");
  record("new password works", newWorks, `url=${new URL(page.url()).pathname}`);
  await page.close();

  console.log("\nSign in with the old password (must be refused):");
  page = await newPage();
  await signIn(page, EMAIL, FIRST_PASSWORD);
  const oldRefused = page.url().includes("/login");
  record("old password is refused", oldRefused, `url=${new URL(page.url()).pathname}`);
  if (!oldRefused) {
    console.log(`    page said: ${(await bodyText(page)).slice(0, 300).replace(/\n/g, " ")}`);
  }
  await page.close();

  console.log(`\nConsole errors captured: ${consoleErrors.length}`);
  for (const e of [...new Set(consoleErrors)].slice(0, 8)) console.log(`  - ${e}`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.error("\nrun aborted:", String(err));
  process.exitCode = 2;
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
