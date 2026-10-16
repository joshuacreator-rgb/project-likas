// Live end-to-end check for the registry + responder-interface clusters
// (commit e760ae2b) against https://likas.fyi.
//
// Public self-registration only creates citizen accounts, so the responder and
// admin accounts for this run are provisioned straight into the database over
// the Railway tunnel (same bcryptjs cost-12 hash the server writes). The
// citizen account goes through the real registration path, which exercises the
// atomic account+registry transaction (spec 5.6). All test data is deleted at
// the end.
//
//   railway connect mysql --tunnel-only -P 3307   (background)
//   MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=... node verify-clusters-live.mjs
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const BASE = "https://likas.fyi";
const stamp = Date.now().toString(36);
const PW = `ClusterCheck-${stamp}-a1`;
const CITIZEN_EMAIL = `cluster.citizen.${stamp}@gmail.com`;
const RESPONDER_EMAIL = `cluster.responder.${stamp}@gmail.com`;
const ADMIN_EMAIL = `cluster.admin.${stamp}@gmail.com`;
const CODE_A = `CLUSTER-A-${stamp}`.toUpperCase();
const CODE_B = `CLUSTER-B-${stamp}`.toUpperCase();

const checks = [];
const record = (ok, label, detail = "") => {
  checks.push({ ok, label });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? `  ${detail}` : ""}`);
};

async function trpc(path, { input, method = "GET", cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let url = `${BASE}/api/trpc/${path}?batch=1`;
  if (method === "GET" && input !== undefined) {
    url += `&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}`;
  }
  if (method !== "GET") headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    ...(method !== "GET" ? { body: JSON.stringify({ 0: { json: input ?? {} } }) } : {}),
  });
  const text = await response.text();
  let envelope = null;
  try { envelope = JSON.parse(text); } catch {}
  const first = Array.isArray(envelope) ? envelope[0] : envelope;
  const data = first?.result?.data;
  const value = data && typeof data === "object" && "json" in data ? data.json : data;
  const error = first?.error?.json?.message ?? (response.ok ? null : `HTTP ${response.status}`);
  const cookieHeader = response.headers.getSetCookie?.() ?? [];
  return { status: response.status, value, error, cookie: cookieHeader.map(c => c.split(";")[0]).join("; "), raw: error ? text.slice(0, 300) : undefined };
}

async function connectDb() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      return await mysql.createConnection({
        host: "127.0.0.1", port: 3307,
        user: process.env.MYSQL_USER ?? "root",
        password: process.env.MYSQL_PASSWORD ?? "",
        database: process.env.MYSQL_DATABASE ?? "railway",
      });
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
  return null;
}

async function provisionOperational(db, email, role, first, last) {
  const passwordHash = await bcrypt.hash(PW, 12);
  const [res] = await db.query(
    "INSERT INTO users (openId, email, name, firstName, middleName, lastName, address, age, phone, role, loginMethod, accountStatus) VALUES (?, ?, ?, ?, 'Cluster', ?, '123 Test St, Pateros', 34, '09171234568', ?, 'password', 'APPROVED')",
    [`local:cluster-${role}-${stamp}`, email, `${first} ${last}`, first, last, role]
  );
  await db.query(
    "INSERT INTO auth_credentials (userId, email, passwordHash) VALUES (?, ?, ?)",
    [res.insertId, email, passwordHash]
  );
  return res.insertId;
}

async function main() {
  console.log("Cluster live e2e against", BASE);
  console.log("  stamp:", stamp, "\n");

  const db = await connectDb();
  if (!db) { console.log("DB tunnel unreachable — cannot provision test accounts. Aborting."); process.exit(2); }

  console.log("0. Provision responder + admin over the DB tunnel");
  const responderDbId = await provisionOperational(db, RESPONDER_EMAIL, "responder", "Ramon", "Responder");
  const adminDbId = await provisionOperational(db, ADMIN_EMAIL, "admin", "Ana", "Admin");
  record(Boolean(responderDbId) && Boolean(adminDbId), "operational accounts inserted", `responderId=${responderDbId} adminId=${adminDbId}`);

  console.log("\n1. Register + login (atomic account + registry row, spec 5.6)");
  const reg = await trpc("localAuth.register", {
    method: "POST",
    input: {
      email: CITIZEN_EMAIL, password: PW, firstName: "Clara", lastName: "Citizen",
      middleName: "Cluster", address: "123 Test St, Pateros", age: 33,
      phone: "09171234567", role: "citizen",
    },
  });
  record(!reg.error && reg.status < 400, "register citizen (public path)", reg.error ?? `status=${reg.status}`);

  const citizen = await trpc("localAuth.login", { method: "POST", input: { email: CITIZEN_EMAIL, password: PW, role: "citizen" } });
  const responder = await trpc("localAuth.login", { method: "POST", input: { email: RESPONDER_EMAIL, password: PW, role: "responder" } });
  const admin = await trpc("localAuth.login", { method: "POST", input: { email: ADMIN_EMAIL, password: PW, role: "admin" } });
  record(!citizen.error, "citizen login", citizen.error ?? "");
  record(!responder.error, "responder login", responder.error ?? "");
  record(!admin.error, "admin login", admin.error ?? "");
  if (citizen.error || responder.error || admin.error) {
    console.log("\nAborting: logins failed, remaining steps need sessions.");
    return finish(db, null, null);
  }

  console.log("\n2. Reports (create as citizen)");
  const mkReport = code => trpc("operations.createRiskReport", {
    method: "POST", cookie: citizen.cookie,
    input: {
      reportCode: code, reportType: "Citizen emergency",
      description: "Automated cluster verification report — safe to delete.",
      location: "Pateros test coordinates, Metro Manila",
      latitude: 14.5447, longitude: 121.0714, priority: "HIGH",
    },
  });
  const reportA = await mkReport(CODE_A);
  const reportB = await mkReport(CODE_B);
  record(!reportA.error, "create report A", reportA.error ?? `id=${reportA.value?.id}`);
  record(!reportB.error, "create report B", reportB.error ?? `id=${reportB.value?.id}`);
  const idA = reportA.value?.id;
  const idB = reportB.value?.id;

  console.log("\n3. Admin workspace queries");
  const responders = await trpc("operations.listResponders", { cookie: admin.cookie });
  record(!responders.error, "listResponders answers");
  const apiOrder = responders.value ?? [];
  console.log("    responder order (first 6):", apiOrder.slice(0, 6).map(r => r.name).join(" | "));
  const me = apiOrder.find(r => r.email === RESPONDER_EMAIL);
  record(Boolean(me), "self-provisioned responder appears in list", me ? `id=${me.id}` : "");

  const evacuees = await trpc("operations.evacuees", { cookie: admin.cookie, input: {} });
  record(!evacuees.error, "evacuees query answers (userEmail join)");
  record(Array.isArray(evacuees.value) && Object.prototype.hasOwnProperty.call(evacuees.value[0] ?? {}, "userEmail"),
    "evacuee rows expose userEmail");

  const summary = await trpc("operations.summary", { cookie: admin.cookie });
  record(typeof summary.value?.households === "number", "summary.households is a real count",
    `households=${summary.value?.households} evacuees=${summary.value?.evacuees}`);

  console.log("\n4. Assignment → enriched notification (spec 4.1/4.2)");
  const assign = await trpc("operations.assignResponder", {
    method: "POST", cookie: admin.cookie, input: { reportId: idA, responderId: me.id },
  });
  record(!assign.error, "assign responder to report A", assign.error ?? "");

  const reports = await trpc("operations.reports", { cookie: admin.cookie });
  const rowA = (reports.value ?? []).find(r => r.id === idA);
  record(rowA?.status === "IN_PROGRESS", "report A is IN_PROGRESS after assignment", `status=${rowA?.status}`);

  const rAlerts = await trpc("operations.alerts", { cookie: responder.cookie });
  const alert = (rAlerts.value ?? []).find(a => a.reportId === idA);
  record(Boolean(alert), "responder alert carries reportId", alert ? `alertId=${alert.id}` : "");
  if (alert) {
    console.log("    alert message:", JSON.stringify(alert.message));
    record(/IN_PROGRESS/i.test(alert.message), "alert states current status");
    record(/assigned/i.test(alert.message), "alert carries assigned date/time");
    record(/attachment/i.test(alert.message), "alert reports attachment state");
    record(/google\.com\/maps/i.test(alert.message), "alert carries a maps pin");
  }

  console.log("\n5. Responder opens the incident (spec 4.2)");
  const timeline = await trpc("operations.incidentTimeline", { cookie: responder.cookie, input: { reportId: idA } });
  record(!timeline.error, "incidentTimeline answers for the assigned responder");
  record(timeline.value?.report?.latitude != null && timeline.value?.report?.longitude != null,
    "report carries coordinates for the map", `lat=${timeline.value?.report?.latitude}`);

  console.log("\n6. Resolve with optional remarks (spec 4.3)");
  const resolve = await trpc("operations.updateRiskReport", {
    method: "POST", cookie: responder.cookie,
    input: { reportId: idA, status: "RESOLVED", resolution: "Cluster check: site cleared, no injuries (automated test)." },
  });
  record(!resolve.error, "responder resolves own incident", resolve.error ?? "");
  const reports2 = await trpc("operations.reports", { cookie: admin.cookie });
  const rowA2 = (reports2.value ?? []).find(r => r.id === idA);
  record(rowA2?.status === "RESOLVED", "report A RESOLVED", `status=${rowA2?.status}`);
  record(/site cleared/.test(rowA2?.resolution ?? ""), "resolution remarks stored", JSON.stringify(rowA2?.resolution ?? null));
  const rAlerts2 = await trpc("operations.alerts", { cookie: responder.cookie });
  record(!(rAlerts2.value ?? []).some(a => a.reportId === idA), "linked alert ended after resolve");

  console.log("\n7. Reject with optional note (spec 4.4)");
  await trpc("operations.updateRiskReport", { method: "POST", cookie: admin.cookie, input: { reportId: idB, status: "VERIFIED" } });
  const reject = await trpc("operations.updateRiskReport", {
    method: "POST", cookie: admin.cookie,
    input: { reportId: idB, status: "REJECTED", resolution: "Cluster check: duplicate of the first test report (automated)." },
  });
  record(!reject.error, "admin rejects with note", reject.error ?? "");
  const reports3 = await trpc("operations.reports", { cookie: admin.cookie });
  const rowB = (reports3.value ?? []).find(r => r.id === idB);
  record(rowB?.status === "REJECTED", "report B REJECTED", `status=${rowB?.status}`);
  record(/duplicate/.test(rowB?.resolution ?? ""), "rejection note stored");

  await finish(db, { idA, idB, me, apiOrder }, { responderDbId, adminDbId });
}

async function finish(db, flow, provisioned) {
  console.log("\n8. DB verification + cleanup (tunnel 127.0.0.1:3307)");
  try {
    const [cols] = await db.query("SHOW COLUMNS FROM evacuees LIKE ?", ["userId"]);
    record(cols.length === 1, "evacuees.userId column exists (migration applied)");
    const [cols2] = await db.query("SHOW COLUMNS FROM evacuees LIKE ?", ["relationshipToHead"]);
    record(cols2.length === 1, "evacuees.relationshipToHead column exists");

    const [heads] = await db.query(
      "SELECT u.email, e.id AS evacueeId, e.householdId, e.relationshipToHead FROM users u JOIN evacuees e ON e.userId = u.id WHERE u.email = ?",
      [CITIZEN_EMAIL]
    );
    record(heads.length === 1, "citizen registration created a linked head row (5.3)");
    record(heads[0]?.relationshipToHead === "Head", "head row stores relationship 'Head' (5.5)", JSON.stringify(heads[0] ?? null));
    record(heads[0]?.householdId === heads[0]?.evacueeId, "head row self-references householdId (5.11)");

    if (flow?.apiOrder?.length > 1) {
      const ids = flow.apiOrder.map(r => r.id);
      const [rows] = await db.query(`SELECT id, lastName, firstName, middleName FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      const byId = new Map(rows.map(r => [r.id, r]));
      const key = r => [r.lastName, r.firstName, r.middleName].map(v => (v ?? "").toLowerCase());
      let sorted = true;
      for (let i = 1; i < ids.length; i++) {
        const a = key(byId.get(ids[i - 1])), b = key(byId.get(ids[i]));
        if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) || (a[0] === b[0] && a[1] === b[1] && a[2] > b[2])) sorted = false;
      }
      record(sorted, "listResponders is ordered LN→FN→MN (5.29)", `n=${ids.length}`);
    }

    const emails = [CITIZEN_EMAIL, RESPONDER_EMAIL, ADMIN_EMAIL];
    const userIds = [flow ? null : null, provisioned?.responderDbId, provisioned?.adminDbId].filter(Boolean);
    const [citizenRows] = await db.query("SELECT id FROM users WHERE email = ?", [CITIZEN_EMAIL]);
    for (const id of citizenRows.map(r => r.id)) userIds.push(id);
    if (flow) {
      const cleanup = [
        ["DELETE FROM alerts WHERE reportId IN (?,?)", [flow.idA, flow.idB]],
        ["DELETE FROM responder_actions WHERE reportId IN (?,?)", [flow.idA, flow.idB]],
        ["DELETE FROM activity_logs WHERE entityType='risk_report' AND entityId IN (?,?)", [flow.idA, flow.idB]],
        ["DELETE FROM evidence_files WHERE reportId IN (?,?)", [flow.idA, flow.idB]],
        ["DELETE FROM risk_reports WHERE id IN (?,?)", [flow.idA, flow.idB]],
      ];
      for (const [sql, params] of cleanup) {
        try { const [res] = await db.query(sql, params); console.log(`    cleanup ok: ${sql.slice(0, 55)}… (${res.affectedRows} rows)`); }
        catch (e) { console.log(`    cleanup skipped: ${sql.slice(0, 55)}… (${e.message.slice(0, 55)})`); }
      }
    }
    const accountCleanup = [
      ["DELETE FROM auth_credentials WHERE email IN (?,?,?)", emails],
      [`DELETE FROM evacuees WHERE userId IN (${userIds.map(() => "?").join(",") || "NULL"})`, userIds],
      ["DELETE FROM users WHERE email IN (?,?,?)", emails],
    ];
    for (const [sql, params] of accountCleanup) {
      try { const [res] = await db.query(sql, params); console.log(`    cleanup ok: ${sql.slice(0, 55)}… (${res.affectedRows} rows)`); }
      catch (e) { console.log(`    cleanup skipped: ${sql.slice(0, 55)}… (${e.message.slice(0, 55)})`); }
    }
  } finally {
    await db.end();
  }

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    console.log("Failed:");
    failed.forEach(f => console.log("  - " + f.label));
    process.exitCode = 1;
  }
}

main().catch(e => { console.error("e2e crashed:", e); process.exit(2); });
