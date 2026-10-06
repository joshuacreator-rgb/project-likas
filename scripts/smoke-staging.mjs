/**
 * Deployment smoke gate for staging.
 *
 * `railway up` does not run migrations, and a deploy can report SUCCESS while
 * the container serves the previous bundle, because the HTML shell looks the
 * same from the outside. A 200 on `/` proves nothing. These checks interrogate
 * things only the running container knows, so they fail when the code that was
 * pushed is not the code being served.
 *
 * Usage:
 *   node scripts/smoke-staging.mjs
 *   BASE_URL=https://host node scripts/smoke-staging.mjs
 *
 * Exit code 0 = every check passed. Non-zero = at least one failed.
 */
const BASE_URL = (process.env.BASE_URL ?? "https://comfortable-youth-staging.up.railway.app").replace(/\/$/, "");

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? `  ${detail}` : ""}`);
}

/**
 * Calls one tRPC procedure.
 *
 * Two details are easy to get wrong, and both were got wrong in the first
 * version of this file, which reported three failures that were purely its own
 * fault:
 *
 * - The URL takes the FULL dotted path, `localAuth.login`, not the router name.
 *   Asking for `localAuth` returns "No procedure found on path localAuth".
 * - Inputs are superjson-wrapped as `{"0":{"json":{...}}}`, and a batched
 *   response is an ARRAY of envelopes, each `{"result":{"data":...}}` or
 *   `{"error":{"json":{...}}}`.
 *
 * A gate that cries wolf gets ignored, which is worse than having no gate, so
 * these shapes are encoded here rather than re-derived each time.
 */
async function trpc(path, { method = "GET", input = {} } = {}) {
  const batched = { 0: { json: input } };
  const query = `batch=1&input=${encodeURIComponent(JSON.stringify(batched))}`;
  const url = `${BASE_URL}/api/trpc/${path}`;
  const response =
    method === "POST"
      ? await fetch(`${url}?batch=1`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batched),
        })
      : await fetch(`${url}?${query}`);

  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* left null so callers can report the raw body */
  }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  return { status: response.status, envelope, text, payload: envelope?.result?.data ?? envelope?.error?.json };
}

async function checkShell() {
  console.log("Shell and bundle:");
  let response;
  try {
    response = await fetch(`${BASE_URL}/`);
  } catch (error) {
    record("GET / responds", false, String(error).slice(0, 120));
    return;
  }
  record("GET / responds", response.status === 200, `status=${response.status}`);

  const html = await response.text();
  const sizeKb = Math.round((Buffer.byteLength(html) / 1024) * 10) / 10;

  // The decisive stale-deploy and regression check. The 358 KB inline runtime was
  // removed from production builds. If it reappears, the deployed bundle predates
  // the fix and every resident pays 358 KB on every page load.
  const inlineRuntime = /<script[^>]*id=["']manus-runtime["']/.test(html);
  record(
    "no 358 KB inline Manus runtime in the served HTML",
    !inlineRuntime,
    inlineRuntime ? `HTML is ${sizeKb} KB, runtime is present` : `HTML is ${sizeKb} KB`,
  );

  const analytics = html.includes("%VITE_ANALYTICS_ENDPOINT%");
  record(
    "no unsubstituted analytics placeholder requesting a 502",
    !analytics,
    analytics ? "placeholder present, every page load will 502" : "",
  );

  const bundle = html.match(/src="\/assets\/index-([A-Za-z0-9_-]+)\.js"/);
  record(
    "entry bundle referenced",
    Boolean(bundle),
    bundle ? `index-${bundle[1]}.js` : "no /assets/index-*.js in the HTML",
  );

  if (bundle) {
    try {
      const asset = await fetch(`${BASE_URL}/assets/index-${bundle[1]}.js`);
      const text = await asset.text();
      const kb = Math.round((Buffer.byteLength(text) / 1024) * 10) / 10;
      record("entry bundle is served", asset.status === 200, `status=${asset.status}, ${kb} KB`);

      // The build host did not pin NODE_ENV, so the app went out with React in
      // development mode: 1619 KB against 1242 KB for the same source, a slower
      // reconciler, and dev-only warning text, all on the low-end phone that is
      // the stated target. Both strings below are development-only React source
      // that Vite's define and tree-shaking remove from a production build, so
      // their presence means the build ran without NODE_ENV=production.
      const devMarkers = [
        ["react.development", "react.development"],
        [
          "The above error occurred in the",
          "React's development-only error boundary message",
        ],
      ];
      const present = devMarkers.filter(([needle]) => text.includes(needle)).map(([, label]) => label);
      record(
        "bundle is a production build, not React development mode",
        present.length === 0,
        present.length ? `development React detected: ${present.join(", ")}` : "",
      );
      if (present.length) {
        console.log(`    note  bundle is ${kb} KB. Expect about ${kb - 377} KB once this`);
        console.log("          is a production build. Check NODE_ENV in nixpacks.toml.");
      }
    } catch (error) {
      record("entry bundle is served", false, String(error).slice(0, 120));
    }
  }
}

/**
 * Unwraps a superjson envelope. A procedure returning `{ json: [] }` means the
 * value is an empty array, not that the call failed. Getting this wrong turns a
 * healthy deploy into a red one, so it is a named step rather than inlined.
 */
function unwrap(payload) {
  if (payload && typeof payload === "object" && "json" in payload) return payload.json;
  return payload;
}

async function checkApi() {
  console.log("\nAPI, the checks that catch a stale deploy:");

  // An empty list is a legitimate 200 on a database with no content published
  // yet. A 404 means the container is running a router from before Wave 3.
  const advice = await trpc("advice.list");
  const value = unwrap(advice.payload);
  const items = value?.advice ?? value;
  record(
    "advice.list answers (Wave 3 router is deployed)",
    advice.status === 200 && Array.isArray(items),
    `status=${advice.status}, items=${Array.isArray(items) ? items.length : `not an array (${typeof items})`}`,
  );

  // Schema-drift detector. A wrong password must be a 401 naming the failure, not
  // a 500 from a shape the server does not recognise. The address is randomised
  // so repeated smoke runs cannot exhaust the login rate limit for one account.
  const email = `smoke-${Date.now().toString(36)}@gmail.com`;
  const login = await trpc("localAuth.login", {
    method: "POST",
    input: { email, password: "definitely-not-the-password", role: "citizen" },
  });
  const message = login.payload?.message ?? login.text.slice(0, 160);
  record(
    "login rejects a wrong password with a 401, not a 500",
    login.status === 401 && /invalid email or password/i.test(String(message)),
    `status=${login.status}, message=${String(message).slice(0, 90)}`,
  );

  // Anonymous access to a staff-only procedure must be refused. A 200 here would
  // be a security finding, not a stale deploy.
  const queue = await trpc("idVerification.queue");
  record("idVerification.queue refuses an anonymous caller", queue.status === 401, `status=${queue.status}`);

  // A forged signature on the upload route must be refused. Catches a regression
  // in the signed-URL guard.
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const upload = await fetch(`${BASE_URL}/api/upload/x.png?exp=${exp}&sig=forged`);
  record("upload route refuses a forged signature", upload.status === 403, `status=${upload.status}`);
}

async function main() {
  console.log(`Smoke gate against ${BASE_URL}\n`);
  await checkShell();
  await checkApi();

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
    console.log("\nDo not trust this deploy. Confirm which commit the container is serving.");
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(error => {
  console.error("smoke gate failed to run:", error);
  process.exit(2);
});