# Project Likas — Requirements Coverage vs. the Six-Section Specification

**Date**: 2026-10-16 · **Method**: code inspection against the adopted specification (Unified Auth · Dashboard Metrics · Incident Reporting & Dispatch · Responder Interface · Evacuee Registry & Households · Real-Time Sync). Every verdict carries a file:line reference. Test/verification history for the already-delivered parts is in `client-change-request-backlog.md` §1–§25.

**Overall: 71 requirements — 61 DONE (86%), 10 PARTIAL (14%), 0 NOT DONE.**

> **Update (2026-10-16, clusters A+B):** the evacuee-registry cluster (G2/G6/G7/G11) and the responder-interface cluster (G1/G10/G8) are implemented **and verified live on staging** (deploy `ade6e4f6`, https://likas.fyi): smoke 10/10, browser 9/9, and the full API e2e (`verify-clusters-live.mjs`) 34/34 — covering the migration columns, atomic registration with the linked `"Head"` row, the enriched assignment notification (status/assigned-time/attachments/maps pin, `reportId` carried), alert → incident open, resolve with optional remarks (alert ends), reject with note, `userEmail` join, real household count and LN→FN→MN responder order. All four former NOT-DONE verdicts are closed; 11 PARTIAL verdicts moved to DONE.

| Section | Requirements | DONE | PARTIAL | NOT DONE |
|---|---|---|---|---|
| 1. Unified Authentication & Role-Based Login | 9 | 7 | 2 | 0 |
| 2. Dashboard Metrics & Interactive Navigation | 8 | 6 | 2 | 0 |
| 3. Incident Reporting & Admin Dispatch | 10 | 7 | 3 | 0 |
| 4. Responder Interface & Incident Resolution | 6 | 5 | 1 | 0 |
| 5. Evacuee Registry & Household Management | 30 | 29 | 1 | 0 |
| 6. Real-Time Database Synchronization | 8 | 7 | 1 | 0 |

---

## 1. Unified Authentication and Role-Based Login

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1.1 | One unified `/login` for admin, responder, staff, citizen | **DONE** | `client/src/pages/Login.tsx:31`; legacy paths `/admin/login`, `/staff/login`, `/responder/login`, `/internal/login` all redirect to `/login` (`client/src/App.tsx:118-122`) |
| 1.2 | Credentials entered only once | **DONE** | Single credential form (`Login.tsx:170-201`); 2FA is a code step, not a re-entered password |
| 1.3 | Automatic redirect to the role dashboard | **DONE** | `onSuccess → navigate(getHomePath(role))` (`Login.tsx:99-122`); role→path map `shared/roles.ts:14-19`; `/` runs `RootRedirect` (`App.tsx:105-113`) |
| 1.4 | No duplicate login pages or double credential steps | **DONE** | Register / password recovery / accept-invitation are separate flows, not login steps; grep shows no second credential ask |
| 1.5 | Authentication persists across authorized pages | **DONE** | 7-day `likas_session` JWT cookie validated per request (`server/_core/context.ts:10-30`); `auth.me` session state |
| 1.6 | Role-based access control (server **and** client) | **DONE** | `protectedProcedure`/`adminProcedure` (`server/_core/trpc.ts:28-45`), `roleProcedure` with per-procedure role arrays (`server/routers.ts:144-152`); client `RouteGuard` redirects mismatches (`App.tsx:79-97,127-138`) |
| 1.7 | User listings sorted Last → First → Middle | **DONE** | `compareNames` (`shared/operations.ts:100`); applied on "User & roles" (`Home.tsx:2769`), heads list, member table, evacuee rows |
| 1.8 | New login in tab 2 invalidates tab 1; stale tab auto-redirects to `/login` | **PARTIAL** | Server side enforced: new login overwrites `activeSessionToken`, old JWT's `sid` fails validation (`server/routers.ts:261`, `context.ts:26`). **Client gap:** the `likas-login`/`likas-logout` BroadcastChannel listener is mounted **only on the Login page** (`Login.tsx:52-96`); an already-open dashboard tab has no listener, so it does not proactively redirect — it only discovers the change on its next `auth.me` refetch |
| 1.9 | Same account in a second tab reuses the session | **DONE** | Cookie-based session; second tab needs no re-login (`useAuth.ts:44`) |

## 2. Dashboard Metrics and Interactive Navigation

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1 | All 8 metrics displayed (total/pending/in-progress/resolved/rejected incidents, registered evacuees, pending evacuees, **total households**) | **DONE** | 8 cards now exist — "Total Households" is its own clickable card (`Home.tsx:1201-1207`) and the value is a real registry count: `COUNT(DISTINCT evacuees.householdId)` (NULLs auto-ignored, `server/db.ts:68`) |
| 2.2 | Every metric card clickable | **PARTIAL** | The 7 drill-down cards are `<button onClick>`. The upper metric grid (Evacuation centers, Registered evacuees, Available resources, Active incidents) is plain `<div>` (`Home.tsx:939-991`); households has no card |
| 2.3 | Clicking navigates to the detailed records view | **DONE** | `setActive("Risk reports")` / `setActive("Evacuees")` (`Home.tsx:994-1035`) |
| 2.4 | Correct filter auto-applied | **DONE** | Card sets `incidentStatusFilter` / `evacueeStatusFilter`; list filters at `Home.tsx:3462-3465, 2547-2550`; "Filtered by … · Clear filter" chip |
| 2.5 | Values are database aggregates | **DONE** | All from `getOperationsSummary()` SQL counts (`server/db.ts:68`), exposed at `server/routers.ts:1118` |
| 2.6 | Counts update immediately on changes | **DONE** | 1.5 s poll (`Home.tsx:423`) + SSE invalidation on `incident`/`alert`/`evacuee` events (`Home.tsx:440-488`) + mutation invalidations |
| 2.7 | Loading, empty and error states | **PARTIAL** | Drill-down lists have empty states and error handling; **metric cards have no skeleton and no query-error UI** (silently render `?? 0`); the Risk reports list has no `isLoading`/`error` branch (`Home.tsx:2058`) |
| 2.8 | Navigation without page reloads | **DONE** | State-based SPA navigation; no `window.location` reloads on this path |

## 3. Incident Reporting and Admin Dispatch Workflow

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 3.1 | Report contains all 10 elements (ID, complainant, type, description, location, date, time, image, status, responder) | **DONE** | `drizzle/schema.ts:28-29` (`reportCode`, `complainantName`, `reportType`, `description`, location+coords, `status`, `assignedResponderId`, timestamp triad; images in `evidence_files`) |
| 3.2 | Unique ID auto-generated + server-side submission timestamp | **PARTIAL** | Timestamp is server-side (`reportedAt defaultNow()`, client cannot send it). **ID is generated client-side** (`CIT-${Date.now()}`, `CitizenHome.tsx:755,773`; `RPT-…`, `Home.tsx:714`); uniqueness rests on the DB unique index |
| 3.3 | Original details permanently preserved | **DONE** | Dispatch update schema admits only `status`/`assignedResponderId`/`resolution` (`server/routers.ts:1305-1320`) — complainant/location/timestamps/description/images cannot be overwritten; verified in QA (orig-data-preserved) |
| 3.4 | Queue: auto-appear, new/unreviewed highlighted, prioritized at top, sortable by urgency/date/time/status | **PARTIAL** | Auto-appear (SSE + poll) and default newest-first (`server/db.ts:84`) exist. **No sort control at all** in the incident list, and **no new/unreviewed highlight** (only the amber PENDING badge) |
| 3.5 | Click a report to review complete information | **DONE** | Timeline modal with full detail, attachments, history (`Home.tsx:1493-1706`) |
| 3.6 | Image preview modal: same page, zoom in/out/reset/close | **DONE** | `client/src/components/ImageLightbox.tsx:104-116` — zoom in, zoom out, reset, close, plus Esc/±/0 keys, wheel/pinch, drag-pan, double-click; in-page overlay (`Home.tsx:1573-1580`), never a new tab |
| 3.7 | Assign Responder: select an **available** registered responder | **PARTIAL** | Dropdown of **all** registered responders (`server/db.ts:43`); **no availability/busy check** anywhere (an already-engaged responder can be assigned) |
| 3.8 | On assignment: save responder, status → In Progress, notify, dashboard/queue update, dispatch timestamp | **DONE** | `server/routers.ts:1461-1485` (`IN_PROGRESS`, `respondedAt`, `RESPONDER_ASSIGNED` audit, `broadcastAssignment`); client toast + invalidation |
| 3.9 | Prevent duplicate/conflicting assignments | **DONE** | Closed-incident and already-assigned guards (`server/routers.ts:1445-1455`), responder self-claim guard (`1514-1517`) |
| 3.10 | Audit trail of every assignment and status change | **DONE** | `activity_logs` rows at every transition (`routers.ts:1275-1280, 1388-1399, 1469-1484, 1519-1524`); Activity log workspace + per-incident timeline |

## 4. Responder Interface and Incident Resolution

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 4.1 | Real-time notification with ID, complainant, description, location, reported date/time, **assigned date/time, status, image** | **DONE** | `describeAssignmentNotification` (`shared/operations.ts:72`, tests in `server/operations.test.ts`) builds the alert message with report code, type, status, complainant, location, reported **and** assigned date/time, plus an attachment count ("N attachments on file — open the incident to view") and a maps pin. Wired into the assign alert with `countStoredEvidenceForReport` (`server/routers.ts:1488-1499`) |
| 4.2 | Clicking the notification opens the incident; side-by-side detail (left: details/images, right: map/location/controls), stacking on small screens | **DONE** | Alert-center items are actionable (`role="button"`, Enter/Space, `Home.tsx:1610-1649`) and resolve `alert.reportId` → `openIncidentFromReportId` (`Home.tsx:793`); the Alerts workspace table cell does the same (`Home.tsx:1340`-area). Detail modal is two-panel (`.incident-detail-panels`, `Home.tsx:1712`): left = reference/priority/complainant/timestamps/timeline/images, right = OpenStreetMap map + address + Google-Maps link (`Home.tsx:1808`) + assignment/resolve/reject controls (`Home.tsx:1951`); stacks to one column ≤760px (`index.css`, `.incident-detail-panels` media rule) |
| 4.3 | Resolve: validate assignment, **confirmation step**, status+timestamp, **optional resolution remarks**, dashboard/notification update, history | **DONE** | Server validates and transitions, sets `resolvedAt`, logs history (`routers.ts:1326-1346, 1388-1399`). Client: Resolve button in the detail modal's action panel (`Home.tsx:1951-1982`) and the list rows both open the shared `ResolutionDialog` (`Home.tsx:255-330`) — confirm + optional remarks textarea, saved via `updateRiskReport({ status, resolution })`; no blind one-click mutation remains |
| 4.4 | Reject: confirmation, optional note, timestamp+remarks, admin notified, counts updated | **DONE** | Reject goes through the same `ResolutionDialog` (confirm + optional note) instead of `window.confirm`/`window.prompt` (`Home.tsx:255-330`, wired at `Home.tsx:1983-1999` and the reports list); `rejectedAt`, admin alert broadcast (`routers.ts:1365-1381`), summary invalidation; rejection remarks also render in the incident timeline (`Home.tsx` timeline REJECTED branch) |
| 4.5 | Real-time sync across admin management, dashboards, notifications, history, official records | **DONE** | `/api/stream` SSE + 1.5 s polls + targeted invalidations (`Home.tsx:440-488, 423-430`); verified live in QA |
| 4.6 | PDF report with all 10 listed fields | **PARTIAL** | `IncidentReportDocument.tsx` includes 9/10: ID (93), type+description (100,115-118), location+coords (108-111), reported time (103), dispatch timestamp (104), final status (102), resolution/rejection (106,120-125), complainant (107), responder actions (127-147). **Missing: "Assigned responder" entirely**, and the "history" excludes the audit/activity-log rows |

## 5. Evacuee Registry and Household Management

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 5.1 | Registration with Last/First/Middle (MN optional) | **DONE** | `AccountRegister.tsx:84-86`; zod `routers.ts:689-691`; `schema.ts:4` |
| 5.2 | Head of Household auto-created in the registry | **DONE** | `registerHouseholdHead` after account creation (`routers.ts:741-752` → `db.ts:686`) |
| 5.3 | Account ↔ registry record linked by a unique identifier | **DONE** | `evacuees.userId` FK → `users.id` (`drizzle/schema.ts:25`); migration `drizzle/0020_registry_link_and_relationship.sql` + boot script `apply-incident-migrations.mjs` apply it; the head row is written with the account id in the same transaction (`server/db.ts:156`); the registry table shows the linked account (`Account` column, `Home.tsx:3046`-area) and search covers it via `userEmail` left-join (`server/db.ts:72`) |
| 5.4 | Duplicate registry entries prevented | **DONE** | Email dedupe at the account layer (inside the same transaction, `server/db.ts:156`); `registerHouseholdHead` dedupes on `evacuees.userId` and returns `{ id, existing }` instead of inserting twice (`server/db.ts:699`, tests `server/household-registry.test.ts`) — and structurally only one head insert happens per registration |
| 5.5 | Head recognized as primary representative | **DONE** | Stored, not inferred: `evacuees.relationshipToHead` varchar(60) (`drizzle/schema.ts:25`); head rows get `"Head"` on creation (`server/db.ts:156, 699`), members carry their relationship value, and the member table reads it (`Home.tsx:3099`) with a `Head of Household` row for the selected head (`Home.tsx:3090`) |
| 5.6 | Account + registry entry saved together (atomic) | **DONE** | `registerLocalUser` wraps credential + user + head-of-household row in one `db.transaction` (`server/db.ts:156`); the router no longer try/catches `registerHouseholdHead` separately (`server/routers.ts:744`) — a registry failure rolls the account back |
| 5.7 | Head added to master registry automatically | **DONE** | `db.ts:686` (ACTIVE, `centerId` null) |
| 5.8 | Household record created/linked | **DONE (implicit)** | Household = the head's own evacuee id (`householdId` self-reference); members link via `evacuees.householdId` |
| 5.9 | Head visible in registry listing | **DONE** | Heads table (`Home.tsx:2645-2693`) |
| 5.10 | Household manageable by authorized staff | **DONE** | Staff/admin tRPC routes with center scoping (`routers.ts:1120-1200`) |
| 5.11 | Dashboard metrics update | **DONE** | Evacuee counts are real registry data; "Total households" now counts `COUNT(DISTINCT evacuees.householdId)` (`server/db.ts:68`) and feeds its own metric card (`Home.tsx:1201-1207`) |
| 5.12 | Master list of heads displayed | **DONE** | `Home.tsx:2646-2693` |
| 5.13 | Staff can **search** and select a head | **DONE** | Dedicated registry search box on the Evacuees screen (`Home.tsx:3037`-area) filtering heads *and* members through `evacueeMatchesSearch` (`shared/operations.ts:106`); selection unchanged (`Home.tsx` headCandidates/selectedHead) |
| 5.14 | Selecting a head shows the adjacent members table | **DONE** | Evacuees workspace members table (`Home.tsx:3075`-area) with head-row + members of the selected household |
| 5.15 | Member table columns: ID, name, age, **relationship**, status, actions | **DONE** | Columns now: Member ID, Full name, Age, **Relationship to head** (`relationshipToHead ?? "Member"`, `Home.tsx:3099`), Registration status, Actions (`Home.tsx:3084` header); head row shows "Head of Household" (`Home.tsx:3090`) |
| 5.16 | Direct Add/Remove buttons (not checkbox selection) | **DONE** | Buttons are direct and the Add path now collects data through the form modal (`Home.tsx:3113`), not prompts; Remove keeps the spec-sanctioned `window.confirm` (destructive action) |
| 5.17 | Add Member opens a member registration form | **DONE** | The modal is rendered from the household state (`householdNewMemberOpen`, form at `Home.tsx:3113`-area): last/first/middle name, age, sex, relationship-to-head (datalist), target household label, submit → `registerEvacuee` with `householdId` + `relationshipToHead` (`Home.tsx:2650` `submitHouseholdMember`); `window.prompt` removed from this flow |
| 5.18 | Member info validated | **DONE** | Client: required names, age `0–120` checked in `submitHouseholdMember` (`Home.tsx:2650`) with `required`/`min`/`max` on the inputs; server zod backstops (name min 1, age 0–120, `routers.ts:190-206`) and errors surface in the modal |
| 5.19 | Member saved to the selected household | **DONE** | `Home.tsx:2679-2687` → `routers.ts:1140-1154` |
| 5.20 | Member table updates automatically | **DONE** | Invalidation + 1.5 s poll (`Home.tsx:2263-2271, 1902-1905`) |
| 5.21 | Household member count updates | **DONE** | Count recomputed live from refreshed data (`Home.tsx:2668`) |
| 5.22 | Evacuation statistics update | **DONE** | `registerEvacuee` transactionally bumps `currentOccupancy` (+FULL flip) (`db.ts:69`); summary/centers invalidated |
| 5.23 | Remove: confirmation dialog | **DONE** | `window.confirm` (`Home.tsx:2715`) |
| 5.24 | Remove: identifies the selected member | **DONE** | Prompt names the member; mutation targets `member.id` |
| 5.25 | Remove: association removed/deactivated, history preserved | **DONE** | Soft unlink (`householdId = null`, row kept) + `HOUSEHOLD_MEMBER_REMOVED` audit (`routers.ts:1182-1200`, `db.ts:687`) |
| 5.26 | Table updates immediately | **DONE** | Invalidation + poll |
| 5.27 | Member count recalculated | **DONE** | `Home.tsx:2668` |
| 5.28 | Changes synchronize across dashboards | **DONE** | `broadcastEvacuee` (`routers.ts:1146,1197`) → SSE invalidation + polling backup |
| 5.29 | Consistent Last → First → Middle sorting on all listings | **PARTIAL** | LN→FN→MN via `compareNames` on heads list, member table, evacuee rows, User & roles — **and now also the responder list**: `listResponders` orders by `lastName, firstName, middleName` (`server/db.ts:43`), so the assignment dropdown follows. **Remaining**: demo-accounts list (date order) |
| 5.30 | Search over names, usernames, household IDs, etc. | **DONE** | `evacueeMatchesSearch` (`shared/operations.ts:106`, tests in `server/operations.test.ts`) matches first/middle/last name, the linked account's email (`userEmail`), household ID and member ID; reachable from the dedicated search box on the Evacuees screen (`Home.tsx:3037`-area), filtering heads and members |

## 6. Real-Time Database Synchronization

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 6.1 | Real-time transport (SSE) with role scoping | **DONE** | `/api/stream` with heartbeat (`server/_core/index.ts:73-111`, `realtime.ts:18-85`) |
| 6.2 | New incident appears in the Admin Queue live | **DONE** | `broadcastIncident` on create (`routers.ts:1282`) → toast + `operations.reports`/`summary` invalidation |
| 6.3 | Assigning a responder notifies that responder | **DONE** | `broadcastAssignment` (`routers.ts:1485,1525`) → responder toast only when `assignedResponderId === user.id` (`Home.tsx:467-474`) |
| 6.4 | Resolving updates admin statistics live | **DONE** | Resolve/reject broadcasts + summary invalidation (`routers.ts:1359-1377`, `Home.tsx:456-466`) |
| 6.5 | Registering a head updates the registry live | **DONE** | `broadcastEvacuee` (`routers.ts:1146`) → evacuees/summary/centers invalidation |
| 6.6 | Adding a member updates family counts | **DONE** | Evacuee broadcast + member-count recompute + 1.5 s poll |
| 6.7 | Switching accounts invalidates the previous session | **PARTIAL** | Server invalidation is complete; the **client broadcast is only consumed on the Login page** (see 1.8) — an open dashboard tab is not proactively redirected |
| 6.8 | UI confirms only after the server validates/saves | **DONE** | Incident submit, household add/remove and login all await the server response; `isPending` gates submits; no optimistic-only writes |

---

## Consolidated gap list (the work to do)

Ordered by weight. "Spec" points at the requirements above.

| ID | Gap | Spec | Weight | Status |
|---|---|---|---|---|
| ~~**G1**~~ | Responder interface: alert-center items must open the incident; detail view needs the two-panel layout (left details/images, right map/location/controls) that stacks on small screens | 4.2 | **Large** | **Closed 2026-10-16** |
| ~~**G2**~~ | Household data model: link accounts to registry rows (`evacuees.userId`), registry-level dedupe, atomic registration, real household counting for the metric | 5.3, 5.4, 5.6, 5.11, 2.1 | **Large** — needed a migration | **Closed 2026-10-16** (migration `drizzle/0020_registry_link_and_relationship.sql` + boot-script column checks) |
| **G3** | Cross-tab session kick: move the BroadcastChannel/storage listener from the Login page into the app shell so a stale dashboard tab redirects to `/login` when another account signs in | 1.8, 6.7 | Small | Open |
| **G4** | ~~Dashboard: make "Total Households" a real clickable card~~ → narrowed: give the upper metric grid + cards loading/error states | 2.2, 2.7 | Small | **Narrowed** — 2.1 closed (card + real count); loading/error states remain |
| **G5** | Incident queue: sort control (urgency/date/time/status) and a new/unreviewed highlight | 3.4 | Medium | Open |
| ~~**G6**~~ | Add Member: replace the two `window.prompt`s with the already-declared modal form (plus fuller validation) | 5.16, 5.17, 5.18 | Small–Medium | **Closed 2026-10-16** |
| ~~**G7**~~ | Registry search on the heads list (names, username, household ID) and reaching the existing evacuee search from the screen | 5.13, 5.30 | Small | **Closed 2026-10-16** |
| ~~**G8**~~ | Resolve flow: confirmation dialog + optional resolution-remarks field on the client | 4.3 | Small | **Closed 2026-10-16** |
| **G9** | PDF: add "Assigned responder" and include the audit/activity-log rows in the action history | 4.6 | Small | Open |
| ~~**G10**~~ | Assignment notification completeness: carry status, assigned date/time and image link | 4.1 | Small | **Closed 2026-10-16** (message carries attachment count + instruction to open the incident; images render in its left panel) |
| ~~**G11**~~ | Member table: add the "Relationship to Head" column; store relationship instead of inferring head status | 5.15, 5.5 | Small | **Closed 2026-10-16** |
| **G12** | Responder availability: filter or flag responders already engaged on open incidents | 3.7 | Medium | Open |
| **G13** | Incident ID generation server-side (currently client-generated, uniqueness via DB index) | 3.2 | Trivial | Open |
| **G14** | ~~Apply LN→FN→MN sorting to the responder dropdown and~~ demo-accounts list | 5.29 | Trivial | **Narrowed** — responder dropdown now sorted in `listResponders` (`server/db.ts:43`); demo-accounts list remains |

**Standing note (updated).** All four former NOT-DONE verdicts (4.2, 5.3, 5.6, 5.17) are now DONE and closed by the cluster work above; nothing in the six-section spec is NOT DONE anymore. Remaining PARTIALs are concentrated in §1 (2), §3 (3), §4 (4.6 PDF), §5 (5.29 demo-accounts sort), §6 (1) plus §2's 2.2/2.7. Gates are green (`tsc`, 353/353 vitest, build, smoke 10/10, browser 9/9, live e2e 34/34 on deploy `ade6e4f6`).
