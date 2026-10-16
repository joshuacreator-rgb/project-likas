// Live end-to-end check for the registry + responder-interface clusters
// (commit e760ae2b) and the G3/G9/G13/G14 small batch (commit f516a8b8)
// against https://likas.fyi.
//
// Public self-registration only creates citizen accounts, so the responder and
// admin accounts for this run are provisioned straight into the database over
// the Railway tunnel (same bcryptjs cost-12 hash the server writes). The
// citizen account goes through the real registration path, which exercises the
// atomic account+registry transaction (spec 5.6). All test data is deleted at
// the end.
//
// The small-batch checks on top of the cluster flow:
//   - 3.2: report A is created WITHOUT a reportCode and gets a server-generated
//     RPT- code; report B still honors a caller-supplied code.
//   - 4.6: incidentTimeline carries assignedResponderName and the audit trail
//     (CREATE, RESPONDER_ASSIGNED, INCIDENT_STATUS_CHANGED with actor names).
//   - 5.29: the demo-accounts list is alphabetized (Alpha probe before Zulu).
//   - 3.7: listResponders flags the assigned responder busy while the incident
//     is open, and free again after it resolves.
//   - 2.2: every metric card is a real <button>, and the Active incidents card
//     drills into the Risk reports list with the ACTIVE filter applied (2.4).
//   - 2.7: two cold tabs with request interception prove the metric-card
//     skeleton → error banner → Retry recovery, and the Risk reports list's
//     loading → error+Retry → recovery sequence.
//   - 1.8 + 3.4: a headless two-tab browser run — a dashboard tab is kicked to
//     /login the moment a second tab signs in, and the responder queue shows
//     the sort control plus the NEW badge on the unreviewed report.
//   - client §26 (alerts/notifications rework): staff receive the incident
//     notifications (citizen emergency, assignment, rejection) with the actual
//     emergency name as the heading and reporter/location/description/time in
//     the body — one row per event, ended alerts drop off staff too — and the
//     Risk reports list has no status dropdown.
//   - client §28: the Risk reports rows carry no Resolve/Reject buttons either
//     (review actions live only inside Incident Details), and the print-media
//     incident report contains the actual report content.
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
const STAFF_EMAIL = `cluster.staff.${stamp}@gmail.com`;
const CODE_B = `CLUSTER-B-${stamp}`.toUpperCase();
/** Client §27: heads registered by the family checks carry this exact address
 *  so finish() can find every row of those households (members inherit the
 *  household, not the address) and clean them up slot-accurately. */
const FAMILY_ADDRESS = `Cluster family check ${stamp} — safe to delete`;
const API_FAMILY = "Clusterapifamily";
const STAFF_FAMILY = "Clusterstafffamily";
const UI_FAMILY = "Clusteruifamily";

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

  console.log("0. Provision responder + admin + staff over the DB tunnel");
  const responderDbId = await provisionOperational(db, RESPONDER_EMAIL, "responder", "Ramon", "Responder");
  const adminDbId = await provisionOperational(db, ADMIN_EMAIL, "admin", "Ana", "Admin");
  const staffDbId = await provisionOperational(db, STAFF_EMAIL, "staff", "Sonia", "Staff");
  record(Boolean(responderDbId) && Boolean(adminDbId) && Boolean(staffDbId), "operational accounts inserted", `responderId=${responderDbId} adminId=${adminDbId} staffId=${staffDbId}`);

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
  const staff = await trpc("localAuth.login", { method: "POST", input: { email: STAFF_EMAIL, password: PW, role: "staff" } });
  record(!citizen.error, "citizen login", citizen.error ?? "");
  record(!responder.error, "responder login", responder.error ?? "");
  record(!admin.error, "admin login", admin.error ?? "");
  record(!staff.error, "staff login", staff.error ?? "");
  if (citizen.error || responder.error || admin.error || staff.error) {
    console.log("\nAborting: logins failed, remaining steps need sessions.");
    return finish(db, null, null);
  }

  console.log("\n2. Reports (create as citizen — A WITHOUT a code, B with one)");
  const mkReport = code => trpc("operations.createRiskReport", {
    method: "POST", cookie: citizen.cookie,
    input: {
      reportType: "Citizen emergency",
      description: "Automated cluster verification report — safe to delete.",
      location: "Pateros test coordinates, Metro Manila",
      latitude: 14.5447, longitude: 121.0714, priority: "HIGH",
      ...(code ? { reportCode: code } : {}),
    },
  });
  const reportA = await mkReport(null);
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

  const reportsPre = await trpc("operations.reports", { cookie: admin.cookie });
  const preA = (reportsPre.value ?? []).find(r => r.id === idA);
  const preB = (reportsPre.value ?? []).find(r => r.id === idB);
  record(/^RPT-[0-9A-Z]+-[0-9A-F]{8}$/.test(preA?.reportCode ?? ""), "report A got a server-generated RPT code (3.2)", preA?.reportCode ?? "missing");
  record(preB?.reportCode === CODE_B, "report B honors a caller-supplied code (back-compat)", preB?.reportCode ?? "missing");

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

  console.log("\n4b. Staff receive the incident notifications (client §26)");
  const sAlerts = await trpc("operations.alerts", { cookie: staff.cookie });
  record(!sAlerts.error, "staff alerts query answers", sAlerts.error ?? "");
  const staffEmergency = (sAlerts.value ?? []).filter(a => a.reportId === idA && a.alertType === "CITIZEN_EMERGENCY");
  record(staffEmergency.length === 1, "staff see exactly ONE citizen-emergency alert for report A (no duplicates)", `count=${staffEmergency.length}`);
  if (staffEmergency[0]) {
    console.log("    staff alert title:", JSON.stringify(staffEmergency[0].title));
    console.log("    staff alert message:", JSON.stringify(staffEmergency[0].message));
    record(staffEmergency[0].title === "Automated cluster verification report — safe to delete.",
      "alert heading is the actual emergency name, not citizen_emergency", staffEmergency[0].title);
    record(/Reported by Clara/.test(staffEmergency[0].message), "alert message names the reporter");
    record(/Pateros test coordinates/.test(staffEmergency[0].message), "alert message carries the location");
    record(/Automated cluster verification report/.test(staffEmergency[0].message), "alert message carries the description");
    record(/Reported /.test(staffEmergency[0].message), "alert message carries the report time");
  }
  const staffAssignment = (sAlerts.value ?? []).find(a => a.reportId === idA && a.alertType === "INCIDENT_ASSIGNMENT");
  record(Boolean(staffAssignment) && /— assignment$/.test(staffAssignment?.title ?? ""),
    "staff also receive the assignment notification, headed by the emergency name", staffAssignment?.title ?? "missing");
  const staffTimeline = await trpc("operations.incidentTimeline", { cookie: staff.cookie, input: { reportId: idA } });
  record(!staffTimeline.error && staffTimeline.value?.report?.reportCode != null,
    "staff can open the incident details behind the notification (link works)", staffTimeline.error ?? "ok");

  const respondersBusy = await trpc("operations.listResponders", { cookie: admin.cookie });
  const busyMe = (respondersBusy.value ?? []).find(r => r.id === me.id);
  record(busyMe?.available === false && (busyMe?.openIncidentCount ?? 0) >= 1,
    "assigned responder flagged busy with open load (3.7)", `open=${busyMe?.openIncidentCount} available=${busyMe?.available}`);

  console.log("\n5. Responder opens the incident (spec 4.2)");
  const timeline = await trpc("operations.incidentTimeline", { cookie: responder.cookie, input: { reportId: idA } });
  record(!timeline.error, "incidentTimeline answers for the assigned responder");
  record(timeline.value?.report?.latitude != null && timeline.value?.report?.longitude != null,
    "report carries coordinates for the map", `lat=${timeline.value?.report?.latitude}`);
  record(/Ramon/.test(timeline.value?.assignedResponderName ?? ""), "timeline carries the assigned responder name (4.6)", timeline.value?.assignedResponderName ?? "null");
  const audit1 = timeline.value?.auditTrail ?? [];
  record(audit1.some(e => e.action === "CREATE" && /Clara/.test(e.actorName ?? "")), "audit trail includes CREATE with the reporter as actor", JSON.stringify(audit1.map(e => `${e.actorName}:${e.action}`)));
  record(audit1.some(e => e.action === "RESPONDER_ASSIGNED" && /Ana/.test(e.actorName ?? "")), "audit trail includes RESPONDER_ASSIGNED (4.6)");

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
  const sAlerts2 = await trpc("operations.alerts", { cookie: staff.cookie });
  record(!(sAlerts2.value ?? []).some(a => a.reportId === idA), "staff dashboards drop the ended alert too (client §26)");
  const timeline2 = await trpc("operations.incidentTimeline", { cookie: responder.cookie, input: { reportId: idA } });
  const audit2 = timeline2.value?.auditTrail ?? [];
  record(audit2.some(e => e.action === "INCIDENT_STATUS_CHANGED" && /Ramon/.test(e.actorName ?? "")),
    "audit trail gains INCIDENT_STATUS_CHANGED after resolve (4.6)", JSON.stringify(audit2.map(e => `${e.actorName}:${e.action}`)));
  const respondersFree = await trpc("operations.listResponders", { cookie: admin.cookie });
  const freeMe = (respondersFree.value ?? []).find(r => r.id === me.id);
  record(freeMe?.available === true, "responder free again after resolve (3.7)", `open=${freeMe?.openIncidentCount} available=${freeMe?.available}`);

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
  const sAlerts3 = await trpc("operations.alerts", { cookie: staff.cookie });
  const staffReject = (sAlerts3.value ?? []).find(a => a.reportId === idB && a.alertType === "INCIDENT_REJECTED");
  record(Boolean(staffReject), "staff receive the rejection notification too (client §26)", staffReject?.title ?? "missing");
  if (staffReject) {
    console.log("    staff reject alert:", JSON.stringify(staffReject.title), "|", JSON.stringify(staffReject.message));
    record(staffReject.title === "Automated cluster verification report — safe to delete. — rejected",
      "rejection heading carries the actual emergency name", staffReject.title);
    record(/Reporter: Clara/.test(staffReject.message), "rejection message names the reporter");
    record(/Reported /.test(staffReject.message), "rejection message carries the reported time");
    record(/duplicate/.test(staffReject.message), "rejection message carries the note");
  }

  console.log("\n7b. Demo-accounts list is alphabetized (spec 5.29)");
  const probeZ = await trpc("admin.provisionDemoAccount", { method: "POST", cookie: admin.cookie, input: { name: `Zulu Probe ${stamp}`, role: "citizen", expiresInDays: 1 } });
  const probeA = await trpc("admin.provisionDemoAccount", { method: "POST", cookie: admin.cookie, input: { name: `Alpha Probe ${stamp}`, role: "citizen", expiresInDays: 1 } });
  record(!probeZ.error && !probeA.error, "probe demo accounts provisioned", probeZ.error ?? probeA.error ?? "");
  const demos = await trpc("admin.demoAccounts", { cookie: admin.cookie });
  const demoList = demos.value ?? [];
  const idxZ = demoList.findIndex(d => d.email === probeZ.value?.email);
  const idxA = demoList.findIndex(d => d.email === probeA.value?.email);
  record(idxA >= 0 && idxZ >= 0 && idxA < idxZ, "demo-accounts list sorted (Alpha probe before Zulu probe)", `alpha@${idxA} zulu@${idxZ} n=${demoList.length}`);

  console.log("\n7d. Staff family management (client §27) — separate families + confirmed removals");
  const centers = await trpc("operations.centers", { cookie: admin.cookie });
  record(!centers.error, "centers query answers", centers.error ?? "");
  const openCenters = (centers.value ?? []).filter(c => c.status === "OPEN");
  const familyCenter = openCenters.slice().sort((a, b) => (b.maximumCapacity - b.currentOccupancy) - (a.maximumCapacity - a.currentOccupancy))[0];
  record(Boolean(familyCenter), "an open center with the most room hosts the family checks",
    familyCenter ? `${familyCenter.name} ${familyCenter.currentOccupancy}/${familyCenter.maximumCapacity}` : "none");

  if (familyCenter) {
    // Permissions first: staff with no center assignment are refused…
    const staffDenied = await trpc("operations.registerFamily", {
      method: "POST", cookie: staff.cookie,
      input: { head: { firstName: "No", lastName: "Permission", age: 30, centerId: familyCenter.id }, members: [] },
    });
    record(Boolean(staffDenied.error) && /assigned evacuation center/.test(staffDenied.error ?? ""),
      "staff without a center assignment cannot register a family (permissions respected)", staffDenied.error ?? "no error");

    // …then staff are assigned (over the tunnel) and the real flows run.
    await db.query("INSERT INTO center_staff (centerId, userId) VALUES (?, ?)", [familyCenter.id, staffDbId]);

    const apiFamily = await trpc("operations.registerFamily", {
      method: "POST", cookie: admin.cookie,
      input: {
        head: { firstName: "Mila", lastName: API_FAMILY, age: 42, sex: "FEMALE", centerId: familyCenter.id, address: FAMILY_ADDRESS, barangay: "Pateros" },
        members: [
          { firstName: "Nico", lastName: API_FAMILY, age: 10, sex: "MALE", relationshipToHead: "Child" },
          { firstName: "Ana", lastName: API_FAMILY, age: 38, sex: "FEMALE", relationshipToHead: "Spouse" },
        ],
      },
    });
    record(!apiFamily.error, "registerFamily saves a separate household with head + members", apiFamily.error ?? `headId=${apiFamily.value?.headId} members=${apiFamily.value?.memberIds?.length}`);
    const apiHeadId = apiFamily.value?.headId;

    const staffFamily = await trpc("operations.registerFamily", {
      method: "POST", cookie: staff.cookie,
      input: {
        head: { firstName: "Sario", lastName: STAFF_FAMILY, age: 45, sex: "MALE", centerId: familyCenter.id, address: FAMILY_ADDRESS },
        members: [{ firstName: "Lira", lastName: STAFF_FAMILY, age: 40, sex: "FEMALE", relationshipToHead: "Spouse" }],
      },
    });
    record(!staffFamily.error, "assigned staff can register a family for their own center", staffFamily.error ?? `headId=${staffFamily.value?.headId}`);

    const famRows1 = (await trpc("operations.evacuees", { cookie: admin.cookie, input: {} })).value ?? [];
    const headRow = famRows1.find(r => r.id === apiHeadId);
    record(headRow?.relationshipToHead === "Head" && headRow?.householdId === apiHeadId,
      "the new head becomes its own household (Head relationship + self householdId)",
      JSON.stringify({ rel: headRow?.relationshipToHead, householdId: headRow?.householdId }));
    const memberRows = famRows1.filter(r => r.householdId === apiHeadId && r.id !== apiHeadId);
    record(memberRows.length === 2, "both members belong to the NEW family — never the selected one", `members=${memberRows.length}`);
    record(memberRows.some(r => r.relationshipToHead === "Child") && memberRows.some(r => r.relationshipToHead === "Spouse"),
      "member relationships stored on the new family");

    // Removal: saved to the DB, list + count update at once, head protected.
    const childId = memberRows.find(r => r.relationshipToHead === "Child")?.id;
    const removal = await trpc("operations.removeHouseholdMember", { method: "POST", cookie: admin.cookie, input: { evacueeId: childId } });
    record(!removal.error, "removeHouseholdMember saves the member removal", removal.error ?? `evacueeId=${childId}`);
    const famRows2 = (await trpc("operations.evacuees", { cookie: admin.cookie, input: {} })).value ?? [];
    record(!famRows2.some(r => r.id === childId), "the removed member is gone from the registry list", `id=${childId}`);
    const familyNow = famRows2.filter(r => r.householdId === apiHeadId || r.id === apiHeadId);
    const familyBefore = memberRows.length + 1; // members + the head itself
    record(familyNow.length === familyBefore - 1, "the family member count drops immediately after the removal",
      `family ${familyBefore} → ${familyNow.length}`);
    const headRemoval = await trpc("operations.removeHouseholdMember", { method: "POST", cookie: admin.cookie, input: { evacueeId: apiHeadId } });
    record(Boolean(headRemoval.error) && /head of a household/.test(headRemoval.error ?? ""),
      "removing the household head is refused", headRemoval.error ?? "no error");
    const missingRemoval = await trpc("operations.removeHouseholdMember", { method: "POST", cookie: admin.cookie, input: { evacueeId: 99999999 } });
    record(Boolean(missingRemoval.error), "removing an unknown member reports an error", missingRemoval.error ?? "no error");

    // Staff removal on their own assigned center completes the staff flow.
    const staffRows = (await trpc("operations.evacuees", { cookie: staff.cookie, input: {} })).value ?? [];
    const staffHeadId = staffFamily.value?.headId;
    const staffSpouse = staffRows.find(r => r.householdId === staffHeadId && r.id !== staffHeadId);
    record(Boolean(staffSpouse), "assigned staff see their new family in the registry", staffSpouse ? `id=${staffSpouse.id}` : "missing");
    if (staffSpouse) {
      const staffRemoval = await trpc("operations.removeHouseholdMember", { method: "POST", cookie: staff.cookie, input: { evacueeId: staffSpouse.id } });
      record(!staffRemoval.error, "assigned staff can remove a member from their own center", staffRemoval.error ?? "");
    }
  }

  console.log("\n7c. Queue UI + cross-tab kick (specs 3.4/1.8) — headless two-tab browser");
  const reportC = await mkReport(null);
  const idC = reportC.value?.id;
  record(!reportC.error, "create an unreviewed report for the queue check", reportC.error ?? `id=${idC}`);
  await browserKickCheck();

  const probeEmails = [probeZ.value?.email, probeA.value?.email].filter(Boolean);
  await finish(db, { idA, idB, idC, me, apiOrder }, { responderDbId, adminDbId, staffDbId }, probeEmails);
}

/**
 * Spec 1.8: tab 1 signs in as admin and sits on the dashboard; tab 2 (same
 * browser profile) signs in as responder. The likas-login broadcast must kick
 * tab 1 back to /login immediately — and must not kick tab 2 itself.
 */
async function browserKickCheck() {
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch { console.log("    SKIP: puppeteer-core not installed — browser kick check not run"); return; }
  const { existsSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const chrome = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.CHROME_PATH,
  ].find(p => p && existsSync(p));
  if (!chrome) { console.log("    SKIP: no Chrome/Edge binary found"); return; }
  const profile = mkdtempSync(join(tmpdir(), "likas-kick-"));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: profile, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"], protocolTimeout: 120000 });
    const page1 = await browser.newPage();
    const page2 = await browser.newPage();
    // Poll the URL from Node rather than waitForFunction: the dashboard page
    // keeps its main thread busy with SSE + refetches, and in-page evaluation
    // polling has proven flaky there (protocol timeouts).
    const waitUrl = async (page, predicate, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate(new URL(page.url()).pathname)) return true;
        await new Promise(r => setTimeout(r, 500));
      }
      return predicate(new URL(page.url()).pathname);
    };
    const login = async (page, email) => {
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
      await page.waitForSelector("#login-email", { timeout: 30000 });
      // Let React finish wiring the form before typing/clicking — clicking a
      // not-yet-hydrated submit button does a native form POST back to /login.
      await new Promise(r => setTimeout(r, 2000));
      await page.type("#login-email", email);
      await page.type("#login-password", PW);
      // In-page click: puppeteer's own click() hangs on this two-page setup
      // (its post-dispatch CDP evaluation never returns — reproducibly), while
      // a DOM click dispatched inside the page behaves normally.
      await page.evaluate(() => document.querySelector("button[type='submit']")?.click());
      const left = await waitUrl(page, p => !p.startsWith("/login"), 45000);
      if (!left) {
        const banner = await page.$eval(".login-error", n => n.innerText).catch(() => null);
        throw new Error(`login did not leave /login (url=${page.url()}, banner=${JSON.stringify(banner)})`);
      }
    };
    await login(page1, ADMIN_EMAIL);
    record(true, "admin signed in on tab 1", page1.url().replace(BASE, ""));
    await login(page2, RESPONDER_EMAIL);
    record(true, "responder signed in on tab 2", page2.url().replace(BASE, ""));
    const kicked = await waitUrl(page1, p => p.startsWith("/login"), 10000);
    record(kicked, "tab 1 kicked to /login after tab 2 signed in (1.8)", `url=${page1.url().replace(BASE, "")}`);
    record(!new URL(page2.url()).pathname.startsWith("/login"), "tab 2 (the new session) was not kicked by its own login", page2.url().replace(BASE, ""));

    // Spec 3.4, on the responder dashboard that tab 2 is now showing: the
    // queue must expose the sort control and highlight the unreviewed (PENDING)
    // report that was created just before this browser run.
    const pollQueue = async () => {
      const deadline = Date.now() + 20000;
      let last = null;
      while (Date.now() < deadline) {
        last = await page2.evaluate(() => ({
          sort: Boolean(document.querySelector(".queue-sort")),
          unreviewed: document.querySelectorAll(".incident-row.unreviewed").length,
          badge: document.querySelector(".incident-new-badge")?.textContent?.trim() ?? null,
        })).catch(() => null);
        if (last?.sort && last.unreviewed >= 1) return last;
        await new Promise(r => setTimeout(r, 700));
      }
      return last;
    };
    const queueInfo = await pollQueue();
    record(Boolean(queueInfo?.sort), "responder queue exposes the sort control (3.4)");
    record((queueInfo?.unreviewed ?? 0) >= 1 && queueInfo?.badge === "NEW",
      "unreviewed incident highlighted with a NEW badge (3.4)", `rows=${queueInfo?.unreviewed} badge=${queueInfo?.badge}`);

    // Spec 2.2: every metric card on the Overview must be a real button, and
    // the "Active incidents" card must drill into a filtered Risk reports list.
    const cardInfo = await page2.evaluate(() => {
      const cards = [...document.querySelectorAll(".metric-grid .metric-card")];
      return { total: cards.length, buttons: cards.filter(c => c.tagName === "BUTTON").length };
    }).catch(() => null);
    record((cardInfo?.buttons ?? 0) >= 12 && cardInfo?.buttons === cardInfo?.total,
      "every metric card is a clickable button (2.2)", `buttons=${cardInfo?.buttons}/${cardInfo?.total}`);
    const clickedCard = await page2.evaluate(() => {
      const card = [...document.querySelectorAll(".metric-grid .metric-card")]
        .find(c => c.tagName === "BUTTON" && /Active incidents/.test(c.textContent ?? ""));
      card?.click();
      return Boolean(card);
    }).catch(() => false);
    record(Boolean(clickedCard), "active-incidents metric card clicked (2.2)");
    const drillInfo = await (async () => {
      const deadline = Date.now() + 15000;
      let last = null;
      while (Date.now() < deadline) {
        last = await page2.evaluate(() => ({
          chip: [...document.querySelectorAll(".workspace-view .empty-copy")].map(n => n.textContent ?? "").join(" | "),
          items: document.querySelectorAll(".responder-incident-item").length,
          unreviewed: document.querySelectorAll(".responder-incident-item.unreviewed").length,
          badge: Boolean(document.querySelector(".responder-incident-item .incident-new-badge")),
        })).catch(() => null);
        if (last && /Filtered by active incidents/.test(last.chip) && last.items >= 1) return last;
        await new Promise(r => setTimeout(r, 500));
      }
      return last;
    })();
    record(/Filtered by active incidents/.test(drillInfo?.chip ?? "") && (drillInfo?.items ?? 0) >= 1,
      "card drills into Risk reports with the ACTIVE filter applied (2.2/2.4)",
      `chip=${JSON.stringify(drillInfo?.chip)} items=${drillInfo?.items}`);
    record((drillInfo?.unreviewed ?? 0) >= 1 && Boolean(drillInfo?.badge),
      "Risk reports list highlights the unreviewed report with NEW (3.4)", `rows=${drillInfo?.unreviewed}`);

    // Client §28: the Risk reports rows no longer carry Resolve/Reject
    // buttons — review actions live only inside Incident Details (kept from
    // §26). The old status dropdown must not come back either.
    const reviewInfo = await page2.evaluate(() => {
      const rows = [...document.querySelectorAll("article.responder-incident-item")];
      const rowActionLabels = rows.flatMap(row =>
        [...row.querySelectorAll("button")].map(b => (b.textContent ?? "").trim())
      );
      return {
        rows: rows.length,
        statusSelects: document.querySelectorAll('select[aria-label="Update report status"]').length,
        reviewButtons: rowActionLabels.filter(t => /^(Resolve|Reject)/.test(t)).length,
      };
    }).catch(() => null);
    record((reviewInfo?.statusSelects ?? -1) === 0,
      "Risk reports list has no status dropdown (client §26)", `selects=${reviewInfo?.statusSelects}`);
    record((reviewInfo?.reviewButtons ?? -1) === 0,
      "Risk reports rows carry no Resolve/Reject buttons — review stays in Incident Details (client §28)",
      `rowActionButtons=${reviewInfo?.reviewButtons}`);
    record((reviewInfo?.rows ?? 0) >= 1,
      "Risk reports list still renders the filtered incident rows", `rows=${reviewInfo?.rows}`);

    // Specs 2.7: two cold tabs with request interception — one blocks the
    // summary query (metric skeleton → error banner → Retry recovery), the
    // other blocks the reports query (list loading → error+Retry → recovery).
    try {
      await metricStatesCheck(browser, login);
      await reportListStatesCheck(browser, login);
    } catch (e) {
      record(false, "metric/report state browser check failed", String(e).slice(0, 220));
    }
    try {
      await familyManagementCheck(browser, login);
    } catch (e) {
      record(false, "family management browser check failed", String(e).slice(0, 220));
    }
    try {
      await incidentPrintCheck(browser, login);
    } catch (e) {
      record(false, "incident print browser check failed", String(e).slice(0, 220));
    }
  } catch (e) {
    // A browser problem must not abort the run before finish() cleans up.
    record(false, "cross-tab kick browser check failed", String(e).slice(0, 220));
  } finally {
    if (browser) await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

/** Small Node-side DOM poller: evaluate `fn` in the page until `done(last)`. */
async function evalPoll(page, fn, done, timeoutMs, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(fn).catch(() => null);
    if (last && done(last)) return last;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return last;
}

/**
 * Spec 2.7 (metric cards): a cold tab where operations.summary is blocked must
 * show the skeleton first, then the error state (— values + Retry banner),
 * and after unblocking + clicking Retry the banner must clear and values return.
 */
async function metricStatesCheck(browser, login) {
  const page = await browser.newPage();
  let blockSummary = true;
  await page.setRequestInterception(true);
  page.on("request", req => {
    if (blockSummary && /operations\.summary/.test(req.url())) req.abort().catch(() => {});
    else req.continue().catch(() => {});
  });
  try {
    await login(page, RESPONDER_EMAIL); // kicks earlier tabs — their checks are done
    const skeleton = await evalPoll(page,
      () => Boolean(document.querySelector(".metric-skeleton")),
      s => s, 12000, 300);
    record(Boolean(skeleton), "metric cards show a skeleton during first load (2.7)");
    const metricErr = await evalPoll(page,
      () => ({
        banner: Boolean(document.querySelector(".metrics-error")),
        retry: Boolean(document.querySelector(".metrics-error button")),
        unavailable: document.querySelectorAll(".metric-card .metric-unavailable").length,
      }),
      s => s.banner, 25000, 500);
    record(Boolean(metricErr?.banner) && Boolean(metricErr?.retry) && (metricErr?.unavailable ?? 0) >= 1,
      "metric cards show an error state with a Retry banner (2.7)", `unavailable=${metricErr?.unavailable}`);
    blockSummary = false;
    await page.evaluate(() => document.querySelector(".metrics-error button")?.click()).catch(() => {});
    const recovered = await evalPoll(page,
      () => ({
        banner: Boolean(document.querySelector(".metrics-error")),
        sample: document.querySelector(".metric-grid .metric-card strong")?.textContent?.trim() ?? "",
      }),
      s => !s.banner && /^[0-9]/.test(s.sample), 20000, 500);
    record(Boolean(recovered) && !recovered.banner && /^[0-9]/.test(recovered?.sample ?? ""),
      "Retry clears the metric error banner and values return (2.7)", `sample=${recovered?.sample}`);
  } finally {
    await page.close();
  }
}

/**
 * Spec 2.7 (Risk reports list): a cold tab where operations.reports is blocked
 * must show the loading state right after opening the workspace, then the
 * error state with Retry, and recover once unblocked + retried.
 */
async function reportListStatesCheck(browser, login) {
  const page = await browser.newPage();
  let blockReports = true;
  await page.setRequestInterception(true);
  page.on("request", req => {
    if (blockReports && /operations\.reports/.test(req.url())) req.abort().catch(() => {});
    else req.continue().catch(() => {});
  });
  try {
    await login(page, RESPONDER_EMAIL);
    // Open the workspace immediately, while the first fetch is still retrying:
    // the list must render its loading state rather than an empty desk.
    await evalPoll(page,
      () => [...document.querySelectorAll(".side-nav button")].some(b => /Risk reports/.test(b.textContent ?? "")),
      s => s, 15000, 300);
    await page.evaluate(() => {
      const nav = [...document.querySelectorAll(".side-nav button")].find(b => /Risk reports/.test(b.textContent ?? ""));
      nav?.click();
    });
    const listLoading = await evalPoll(page,
      () => Boolean(document.querySelector(".list-state")) && !document.querySelector(".list-state-error"),
      s => s, 8000, 250);
    record(Boolean(listLoading), "Risk reports list shows a loading state (2.7)");
    const listErr = await evalPoll(page,
      () => ({
        error: Boolean(document.querySelector(".list-state-error")),
        retry: Boolean(document.querySelector(".list-state-error button")),
      }),
      s => s.error, 30000, 500);
    record(Boolean(listErr?.error) && Boolean(listErr?.retry),
      "Risk reports list shows an error state with Retry (2.7)");
    blockReports = false;
    await page.evaluate(() => document.querySelector(".list-state-error button")?.click()).catch(() => {});
    const listOk = await evalPoll(page,
      () => ({
        items: document.querySelectorAll(".responder-incident-item").length,
        error: Boolean(document.querySelector(".list-state-error")),
      }),
      s => s.items >= 1 && !s.error, 20000, 500);
    record(Boolean(listOk) && listOk.items >= 1 && !listOk.error,
      "Risk reports list recovers after Retry (2.7)", `items=${listOk?.items}`);
  } finally {
    await page.close();
  }
}

/**
 * Client §27: the staff Evacuees section's two family flows end to end.
 * "Manage Your Family" opens a modal with the selected family's details and
 * members; each member has a Remove button that asks for confirmation naming
 * the member before deleting, and the member list + count update on the spot.
 * "Add Another Family" opens the registration form, blocks an empty submit,
 * and saves a brand-new household record of its own.
 */
async function familyManagementCheck(browser, login) {
  const page = await browser.newPage();
  try {
    await login(page, ADMIN_EMAIL);
    await evalPoll(page,
      () => [...document.querySelectorAll(".side-nav button")].some(b => /Evacuees/.test(b.textContent ?? "")),
      s => s, 15000, 300);
    await page.evaluate(() => {
      const nav = [...document.querySelectorAll(".side-nav button")].find(b => /Evacuees/.test(b.textContent ?? ""));
      nav?.click();
    });

    const toolbar = await evalPoll(page,
      () => ({
        addFamily: [...document.querySelectorAll("button")].some(b => (b.textContent ?? "").trim() === "Add Another Family"),
        manage: [...document.querySelectorAll(".workspace-user-table button")].some(b => (b.textContent ?? "").trim() === "Manage Your Family"),
      }),
      s => s.addFamily && s.manage, 15000, 400);
    record(Boolean(toolbar?.addFamily), "Evacuees section shows the Add Another Family button (client §27)");
    record(Boolean(toolbar?.manage), "family rows offer Manage Your Family (client §27)");

    // Open the family the API step left as head + spouse.
    const opened = await (async () => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        const ok = await page.evaluate(() => {
          const row = [...document.querySelectorAll(".workspace-user-table tbody tr")].find(tr => (tr.textContent ?? "").includes("Clusterapifamily"));
          const btn = row ? [...row.querySelectorAll("button")].find(b => (b.textContent ?? "").trim() === "Manage Your Family") : null;
          btn?.click();
          return Boolean(btn);
        }).catch(() => false);
        if (ok) return true;
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    })();
    record(Boolean(opened), "Manage Your Family opens the selected family in a modal (client §27)");

    const familyInfo = await evalPoll(page,
      () => {
        const modal = [...document.querySelectorAll("div.family-modal")].find(m => /Manage Your Family/.test(m.textContent ?? ""));
        if (!modal) return null;
        const details = modal.querySelector(".family-details")?.textContent ?? "";
        const rows = [...modal.querySelectorAll(".workspace-user-table tbody tr")].map(tr => tr.textContent ?? "");
        return {
          details,
          count: details.match(/Family members(\d+)/)?.[1] ?? null,
          removes: rows.length && [...modal.querySelectorAll(".workspace-user-table tbody tr")].flatMap(tr => [...tr.querySelectorAll("button")]).filter(b => /Remove member/.test(b.textContent ?? "")).length,
          rows,
        };
      },
      s => Boolean(s), 10000, 400);
    record(Boolean(familyInfo?.details) && /Household ID/.test(familyInfo?.details ?? ""),
      "family management modal shows the selected family's details (client §27)",
      JSON.stringify((familyInfo?.details ?? "").slice(0, 140)));
    record(familyInfo?.count === "2", "modal shows the live family member count (head + spouse)", `count=${familyInfo?.count}`);
    record(/Ana/.test((familyInfo?.rows ?? []).join(" ")) && (familyInfo?.removes ?? 0) >= 1,
      "every member row carries a Delete/Remove button (client §27)", `removes=${familyInfo?.removes}`);

    const clickRemoveOn = async name => page.evaluate(memberName => {
      const modal = [...document.querySelectorAll("div.family-modal")].find(m => /Manage Your Family/.test(m.textContent ?? ""));
      const row = [...(modal?.querySelectorAll(".workspace-user-table tbody tr") ?? [])].find(tr => new RegExp(memberName).test(tr.textContent ?? ""));
      const btn = row ? [...row.querySelectorAll("button")].find(b => /Remove member/.test(b.textContent ?? "")) : null;
      btn?.click();
      return Boolean(btn);
    }, name).catch(() => false);

    // Removal asks first, and the confirmation names the selected member.
    await clickRemoveOn("Ana");
    const confirmInfo = await evalPoll(page,
      () => {
        const panel = document.querySelector(".family-confirm");
        return panel ? { text: panel.textContent ?? "", buttons: [...panel.querySelectorAll("button")].map(b => (b.textContent ?? "").trim()) } : null;
      },
      s => Boolean(s), 8000, 300);
    record(/Ana/.test(confirmInfo?.text ?? "") && /Member ID \d+/.test(confirmInfo?.text ?? "") && (confirmInfo?.buttons ?? []).includes("Remove member"),
      "deletion asks for confirmation and clearly identifies the selected member (client §27)",
      JSON.stringify((confirmInfo?.text ?? "").slice(0, 170)));

    await page.evaluate(() => {
      const panel = document.querySelector(".family-confirm");
      const cancel = [...(panel?.querySelectorAll("button") ?? [])].find(b => (b.textContent ?? "").trim() === "Cancel");
      cancel?.click();
    }).catch(() => {});
    const afterCancel = await evalPoll(page,
      () => ({
        panel: Boolean(document.querySelector(".family-confirm")),
        member: /Ana/.test([...document.querySelectorAll("div.family-modal .workspace-user-table")].map(t => t.textContent ?? "").join(" ")),
      }),
      s => !s.panel, 6000, 300);
    record(!afterCancel?.panel && Boolean(afterCancel?.member),
      "cancelling keeps the member untouched (client §27)", JSON.stringify(afterCancel));

    // Confirming for real deletes the member and updates the count on the spot.
    await clickRemoveOn("Ana");
    await evalPoll(page, () => Boolean(document.querySelector(".family-confirm")), s => s, 6000, 300);
    await page.evaluate(() => {
      const panel = document.querySelector(".family-confirm");
      const confirm = [...(panel?.querySelectorAll("button") ?? [])].find(b => (b.textContent ?? "").trim() === "Remove member");
      confirm?.click();
    }).catch(() => {});
    const afterRemove = await evalPoll(page,
      () => {
        const modal = [...document.querySelectorAll("div.family-modal")].find(m => /Manage Your Family/.test(m.textContent ?? ""));
        if (!modal) return null;
        const rows = [...modal.querySelectorAll(".workspace-user-table tbody tr")].map(tr => tr.textContent ?? "").join(" | ");
        return {
          memberGone: !/Ana/.test(rows),
          count: (modal.querySelector(".family-details")?.textContent ?? "").match(/Family members(\d+)/)?.[1] ?? null,
        };
      },
      s => Boolean(s) && s.memberGone && s.count === "1", 15000, 500);
    record(Boolean(afterRemove?.memberGone) && afterRemove?.count === "1",
      "confirmed removal deletes the member and the count updates immediately (client §27)",
      `count=${afterRemove?.count} gone=${afterRemove?.memberGone}`);

    await page.evaluate(() => {
      const modal = [...document.querySelectorAll("div.family-modal")].find(m => /Manage Your Family/.test(m.textContent ?? ""));
      const close = [...(modal?.querySelectorAll("button") ?? [])].find(b => (b.textContent ?? "").trim() === "Close");
      close?.click();
    }).catch(() => {});
    await evalPoll(page, () => !document.querySelector("div.family-modal"), s => s, 6000, 300);

    // Add Another Family: the form opens, refuses an empty submit, then saves.
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b => (b.textContent ?? "").trim() === "Add Another Family");
      btn?.click();
    }).catch(() => {});
    const formOpen = await evalPoll(page,
      () => Boolean([...document.querySelectorAll("form.family-modal h2")].find(h => /Add Another Family/.test(h.textContent ?? ""))),
      s => s, 8000, 300);
    record(Boolean(formOpen), "Add Another Family opens the family registration form (client §27)");

    await page.evaluate(() => {
      const form = document.querySelector("form.family-modal");
      form?.querySelector("button[type='submit']")?.click();
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    const emptyBlocked = await page.evaluate(() =>
      Boolean([...document.querySelectorAll("form.family-modal h2")].find(h => /Add Another Family/.test(h.textContent ?? ""))));
    record(Boolean(emptyBlocked), "empty submission is blocked by required-field validation (client §27)");

    await page.type('input[name="headLastName"]', UI_FAMILY);
    await page.type('input[name="headFirstName"]', "Bella");
    await page.type('input[name="headAge"]', "36");
    await page.type('input[name="headAddress"]', FAMILY_ADDRESS);
    await page.type('input[name="headBarangay"]', "Pateros");
    const centerValue = await page.$eval('select[name="headCenter"] option', o => o.value).catch(() => null);
    if (centerValue) await page.select('select[name="headCenter"]', centerValue);
    record(Boolean(centerValue), "the family form offers an evacuation center to choose", `value=${centerValue}`);

    await page.evaluate(() => {
      const btn = [...(document.querySelectorAll("form.family-modal button") ?? [])].find(b => (b.textContent ?? "").trim() === "Add family member");
      btn?.click();
    }).catch(() => {});
    const memberRow = await evalPoll(page,
      () => Boolean(document.querySelector('form.family-modal [data-member-index="0"]')),
      s => s, 6000, 300);
    record(Boolean(memberRow), "the form accepts additional family members (client §27)");
    await page.type('form.family-modal [data-member-index="0"] input[data-field="lastName"]', UI_FAMILY);
    await page.type('form.family-modal [data-member-index="0"] input[data-field="firstName"]', "Cesar");
    await page.type('form.family-modal [data-member-index="0"] input[data-field="age"]', "11");
    await page.type('form.family-modal [data-member-index="0"] input[data-field="relationship"]', "Child");

    await page.evaluate(() => {
      const form = document.querySelector("form.family-modal");
      form?.querySelector("button[type='submit']")?.click();
    }).catch(() => {});
    const saved = await evalPoll(page,
      () => ({
        closed: !document.querySelector("form.family-modal"),
        row: [...document.querySelectorAll(".workspace-user-table tbody tr")].some(tr => (tr.textContent ?? "").includes("Clusteruifamily")),
      }),
      s => s.closed && s.row, 25000, 600);
    record(Boolean(saved?.closed) && Boolean(saved?.row),
      "the new family is saved as its own record and appears in the list (client §27)", JSON.stringify(saved));

    // The saved family opens as its own household with its members.
    const reopened = await (async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const ok = await page.evaluate(() => {
          const row = [...document.querySelectorAll(".workspace-user-table tbody tr")].find(tr => (tr.textContent ?? "").includes("Clusteruifamily"));
          const btn = row ? [...row.querySelectorAll("button")].find(b => (b.textContent ?? "").trim() === "Manage Your Family") : null;
          btn?.click();
          return Boolean(btn);
        }).catch(() => false);
        if (ok) return true;
        await new Promise(r => setTimeout(r, 400));
      }
      return false;
    })();
    const newFamilyInfo = await evalPoll(page,
      () => {
        const modal = [...document.querySelectorAll("div.family-modal")].find(m => /Manage Your Family/.test(m.textContent ?? ""));
        if (!modal) return null;
        return {
          count: (modal.querySelector(".family-details")?.textContent ?? "").match(/Family members(\d+)/)?.[1] ?? null,
          rows: [...modal.querySelectorAll(".workspace-user-table tbody tr")].map(tr => tr.textContent ?? "").join(" | "),
        };
      },
      s => Boolean(s && s.count), 8000, 400);
    record(Boolean(reopened) && newFamilyInfo?.count === "2" && new RegExp(UI_FAMILY).test(newFamilyInfo?.rows ?? ""),
      "the saved family opens as its OWN household with head + member (client §27)",
      `count=${newFamilyInfo?.count} rows=${JSON.stringify((newFamilyInfo?.rows ?? "").slice(0, 150))}`);
  } finally {
    await page.close();
  }
}

/**
 * Client §28: the print preview must pop up ABOVE the still-open Incident
 * Details modal (it used to be trapped behind it in a z-100 wrapper), the
 * browser print dialog must open by itself, and the printed page must contain
 * the report itself (the old print CSS hid the whole app — including the
 * report rendered inside it — blanking the printout).
 */
async function incidentPrintCheck(browser, login) {
  const page = await browser.newPage();
  try {
    await login(page, ADMIN_EMAIL);
    await evalPoll(page,
      () => [...document.querySelectorAll(".side-nav button")].some(b => /Risk reports/.test(b.textContent ?? "")),
      s => s, 15000, 300);
    await page.evaluate(() => {
      const got = [...document.querySelectorAll("button")].find(b => /Got it/i.test(b.textContent ?? ""));
      got?.click();
      const nav = [...document.querySelectorAll(".side-nav button")].find(b => /Risk reports/.test(b.textContent ?? ""));
      nav?.click();
    });
    await evalPoll(page,
      () => Boolean(document.querySelector(".responder-incident-item .incident-timeline-button")),
      s => s, 20000, 400);

    const opened = await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".responder-incident-item .incident-timeline-button")][0];
      btn?.click();
      return Boolean(btn);
    });
    record(Boolean(opened), "Risk reports row opens the Incident Details modal");
    await page.waitForSelector(".incident-detail-modal", { timeout: 15000 });

    const geo = await evalPoll(page,
      () => {
        const modal = document.querySelector(".incident-detail-modal");
        return modal ? { width: Math.round(modal.getBoundingClientRect().width) } : null;
      },
      s => Boolean(s), 8000, 300);
    record((geo?.width ?? 0) >= 800, "Incident Details modal renders at full working width (client §28)", `width=${geo?.width}`);

    // Stub window.print so the auto-print is observable without a real dialog.
    await page.evaluate(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".incident-timeline-head button")].find(b => /Print incident/.test(b.textContent ?? ""));
      btn?.click();
    });
    await page.waitForSelector(".report-document", { timeout: 15000 });

    const onTop = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return Boolean(el && el.closest(".report-document"));
    });
    record(onTop, "print preview pops up ABOVE the Incident Details modal (client §28)");

    const printed = await evalPoll(page,
      () => ({ calls: window.__printCalls ?? 0 }),
      s => s.calls >= 1, 8000, 300);
    record((printed?.calls ?? 0) >= 1, "print preview opens the browser print dialog by itself (client §28)", `calls=${printed?.calls}`);

    await page.emulateMediaType("print");
    await new Promise(r => setTimeout(r, 400));
    const printState = await page.evaluate(() => {
      const pageEl = document.querySelector(".report-page");
      const cs = pageEl ? getComputedStyle(pageEl) : null;
      return {
        visible: cs ? cs.visibility === "visible" && cs.display !== "none" : false,
        hasReport: /PROJECT LIKAS/i.test(document.body.innerText ?? ""),
      };
    });
    record(Boolean(printState?.visible) && Boolean(printState?.hasReport),
      "printed page contains the actual incident report, not a blank sheet (client §28)",
      JSON.stringify(printState));
    await page.emulateMediaType(null);
  } finally {
    await page.close();
  }
}

async function finish(db, flow, provisioned, extraEmails = []) {
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

    const emails = [CITIZEN_EMAIL, RESPONDER_EMAIL, ADMIN_EMAIL, STAFF_EMAIL, ...extraEmails];
    const userIds = [flow ? null : null, provisioned?.responderDbId, provisioned?.adminDbId, provisioned?.staffDbId].filter(Boolean);
    const [citizenRows] = await db.query("SELECT id FROM users WHERE email = ?", [CITIZEN_EMAIL]);
    for (const id of citizenRows.map(r => r.id)) userIds.push(id);
    if (flow) {
      const reportIds = [flow.idA, flow.idB, flow.idC].filter(Boolean);
      const inReports = reportIds.length ? reportIds.map(() => "?").join(",") : "NULL";
      const cleanup = [
        [`DELETE FROM alerts WHERE reportId IN (${inReports})`, reportIds],
        [`DELETE FROM responder_actions WHERE reportId IN (${inReports})`, reportIds],
        [`DELETE FROM activity_logs WHERE entityType='risk_report' AND entityId IN (${inReports})`, reportIds],
        [`DELETE FROM evidence_files WHERE reportId IN (${inReports})`, reportIds],
        [`DELETE FROM risk_reports WHERE id IN (${inReports})`, reportIds],
      ];
      for (const [sql, params] of cleanup) {
        try { const [res] = await db.query(sql, params); console.log(`    cleanup ok: ${sql.slice(0, 55)}… (${res.affectedRows} rows)`); }
        catch (e) { console.log(`    cleanup skipped: ${sql.slice(0, 55)}… (${e.message.slice(0, 55)})`); }
      }
    }
    // Client §27: family-check heads carry the address marker; their members
    // live under those households. Delete the rows and hand every center its
    // slots back so repeated runs never drift occupancy.
    try {
      const [heads] = await db.query("SELECT id FROM evacuees WHERE address = ?", [FAMILY_ADDRESS]);
      const headIds = heads.map(r => r.id);
      if (headIds.length) {
        const ph = headIds.map(() => "?").join(",");
        const predicate = `id IN (${ph}) OR householdId IN (${ph})`;
        const params = [...headIds, ...headIds];
        const [rows] = await db.query(`SELECT centerId FROM evacuees WHERE ${predicate}`, params);
        const perCenter = new Map();
        for (const row of rows) perCenter.set(row.centerId, (perCenter.get(row.centerId) ?? 0) + 1);
        for (const [centerId, n] of perCenter) {
          await db.query("UPDATE evacuation_centers SET currentOccupancy = GREATEST(currentOccupancy - ?, 0) WHERE id = ?", [n, centerId]);
          await db.query("UPDATE evacuation_centers SET status = CASE WHEN status = 'FULL' AND currentOccupancy < maximumCapacity THEN 'OPEN' ELSE status END WHERE id = ?", [centerId]);
        }
        const [res] = await db.query(`DELETE FROM evacuees WHERE ${predicate}`, params);
        console.log(`    cleanup ok: e2e family households (${headIds.length} heads, ${res.affectedRows} rows, slots given back)`);
      }
    } catch (e) { console.log(`    cleanup skipped: e2e family households… (${String(e.message).slice(0, 55)})`); }
    // Activity logs referencing the test users (as actor or as the entity they
    // provisioned, e.g. DEMO_PROVISIONED) must go before users, or the FK on
    // actorId blocks the users delete.
    const inUsersLog = userIds.length ? userIds.map(() => "?").join(",") : "NULL";
    try {
      const [res] = await db.query(
        `DELETE FROM activity_logs WHERE actorId IN (${inUsersLog}) OR (entityType='user' AND entityId IN (${inUsersLog}))`,
        [...userIds, ...userIds]
      );
      console.log(`    cleanup ok: activity_logs by test actors/entities (${res.affectedRows} rows)`);
    } catch (e) { console.log(`    cleanup skipped: activity_logs by actor… (${e.message.slice(0, 55)})`); }
    const accountCleanup = [
      [`DELETE FROM auth_credentials WHERE email IN (${emails.map(() => "?").join(",")})`, emails],
      // The §27 staff center assignment must go before the user row it references.
      [`DELETE FROM center_staff WHERE userId IN (${userIds.map(() => "?").join(",") || "NULL"})`, userIds],
      [`DELETE FROM evacuees WHERE userId IN (${userIds.map(() => "?").join(",") || "NULL"})`, userIds],
      [`DELETE FROM users WHERE email IN (${emails.map(() => "?").join(",")})`, emails],
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
