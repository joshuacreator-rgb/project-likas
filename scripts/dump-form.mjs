import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "https://comfortable-youth-staging.up.railway.app";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const path = process.argv[2] ?? "/register";

const profile = mkdtempSync(join(tmpdir(), "likas-dump-"));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle2", timeout: 60000 });

const dump = await page.evaluate(() => ({
  url: location.pathname,
  fields: [...document.querySelectorAll("input,select,textarea")].map(el => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type") ?? "",
    name: el.getAttribute("name") ?? "",
    id: el.id || "",
    placeholder: el.getAttribute("placeholder") ?? "",
    autocomplete: el.getAttribute("autocomplete") ?? "",
    label: (() => {
      const l = el.closest("label");
      return l ? l.innerText.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    })(),
  })),
  buttons: [...document.querySelectorAll("button")].map(b =>
    `${b.innerText.replace(/\s+/g, " ").trim().slice(0, 40)} [type=${b.getAttribute("type") ?? "submit"}]`
  ),
  text: document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 1400),
}));

console.log(`url: ${dump.url}\n`);
console.log("FIELDS:");
for (const f of dump.fields) {
  console.log(`  <${f.tag} type=${f.type} name=${f.name} id=${f.id} ac=${f.autocomplete} ph="${f.placeholder}">`);
  if (f.label) console.log(`      label: ${f.label}`);
}
console.log("\nBUTTONS:");
for (const b of dump.buttons) console.log(`  ${b}`);
console.log("\nVISIBLE TEXT:");
console.log(dump.text.split("\n").map(l => `  ${l}`).join("\n"));

await browser.close();
rmSync(profile, { recursive: true, force: true });
