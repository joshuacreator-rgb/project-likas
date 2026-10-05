# Project Likas — Client Change Request Backlog

**Source**: Client request (Tagalog), reviewed against the codebase
**Date**: 2026-09-30 · **Last updated**: 2026-10-03
**Status**: Wave 3 delivered to staging. Awaiting client confirmation on the blocking questions and on items marked *Proposed*.
**Prepared by**: BA review of `C:\Users\joshua-macailao\Documents\project-likas\project-likas`

> **Scope change agreed with the client (2026-10-03).** The client asked for advice *videos* (request 2). When the cost of video was raised they offered **step-by-step photos** as an acceptable substitute for the November release. Video is therefore **deferred to a follow-on**, and US-8/US-9/US-10 ship advice text plus photos. See US-10 and section 7.

---

## 1. Client request (as received)

1. "May ilan kulang pa sa Citizen na pwede sila mag upload ng video or picture pangyayari" — Citizens should be able to upload video or photo of what is happening.
2. "Mag add mga advice at Video sana tungkol sa earthquake, Storm at Fire, kung ano paghahanda dapat nila gawin" — Add advice and videos for earthquake, storm, and fire, covering what preparations they should make.
3. "Tapus register, I hope meron nakalagay ng complete Name, Address, Age, Cp number" — At registration, collect complete Name, Address, Age, and CP number.
4. "Mag uupload sila ng Valid ID at ito dapat yung nirereview ni Admin kung taga Pateros sya bago mag karoon ng account" — Citizens upload a Valid ID; an Administrator reviews it to confirm they are from Pateros before they get an account.

**Client answers received on follow-up (recorded 2026-10-03)**

| # | Question asked | Client answer | Effect |
|---|---|---|---|
| A1 | Is Gmail-only registration still correct? | **Yes.** | OQ 4 closed. Gmail-only registration is confirmed as the intended rule. |
| A2 | Advice videos are expensive — photos instead? | **Photos are acceptable** as the substitute for video. | US-10 created. Video deferred to a follow-on. |
| A3 | Should the Valid ID block be re-asked? | **Skipped on the first pass, answered on the second.** OQ 1, 2, 3 and 7 were all answered on 2026-10-03. | Wave 1 unblocked. See section 5. |
| A4 | Is BFP (Bureau of Fire Protection) a separate role? | **No** — handled by the existing responder role. | No new role needed. Given verbally; *confirm in writing*. |
| A5 | Should the new registration fields appear in admin reports and exports? | Not answered. | OQ 9 stays open. |

---

## 2. Code review findings

What the client assumes vs. what actually exists in the codebase.

| # | Client assumes | Reality in code |
|---|---|---|
| 1 | Photo/video upload does not exist | Backend **does** exist: `operations.uploadEvidence` (images + PDF only, 10 MB cap, S3). The UI is **broken** — `client/src/pages/Home.tsx:1531` captures a filename and never calls the mutation. Nothing has ever been uploaded from the UI. The citizen page has no file input at all. **Video is rejected by the server today.** |
| 2 | Advice/videos are new | Correct, nothing existed. Bilingual precedent exists (`alerts.titleFilipino`, `alerts.messageFilipino`). Advice text and step photos are now built; video is not. |
| 3 | Registration is missing fields | Correct. `client/src/pages/AccountRegister.tsx` collects only role, name, email, password. `users` table has a `phone` column but **no `address`, `age`, or `barangay` column**. |
| 4 | Admin review of Valid ID is needed | The approval loop **already works** — `admin.updateUserApproval`, Approve/Decline buttons at `Home.tsx:2243`, citizen polls `localAuth.checkApproval` every 500 ms. This request **adds a step**, it does not require building the loop. |

### 2.1 Schema changes required

| Table | Change | Story | Status |
|---|---|---|---|
| `users` | add `address`, `age`; reuse existing `phone` for CP number | US-1 | **Applied** — migration `0012` |
| new | citizen ID documents table — userId, fileKey, idType, idNumberMasked, addressOnId, status, reviewedBy, reviewedAt, rejectionReason, `purgeAfter` | US-2 | Not started — unblocked, design settled |
| `safety_advice` | new table: slug, category, bilingual title/summary/body, status, `isEmergency`, `sortOrder`, `publishedAt`, `archivedAt`, `createdBy` | US-8 | **Applied** — migration `0013` |
| `advice_steps` | new child table: `adviceId`, `stepNo`, bilingual title and instruction, `imageUrl`, `imageKey`; composite index on `(adviceId, stepNo)`, `ON DELETE CASCADE` | US-10 | **Applied** — migration `0013` |

Note: `database/project-likas.sql` is the schema reference and **needs regenerating** to include `safety_advice` and `advice_steps`. It was last refreshed in `500dcaaf`.

Two tables will be added for US-2/US-3 in a future wave:

- `citizen_id_documents` — one row per uploaded ID, carrying the review decision and `purgeAfter` (the retention date from 5.1)
- A review-decision record, or columns on the above — the address read from the ID, who decided, and when. US-3 AC 8 requires the *basis* for an approval to be explainable after the fact

**Storage decision, not yet recorded as code:** ID images must **not** be served from the public `/manus-storage/{key}` proxy that `storagePut` returns (`server/storage.ts:71`). An authenticated serving route with an authorization check and an audit-log write is required. This applies to US-10's step photos too in principle, though those are not personal documents and the risk is lower.

### 2.2 Pre-existing issues found during review

| Issue | Location | Impact on this backlog |
|---|---|---|
| Evidence upload UI never calls the mutation | `client/src/pages/Home.tsx:1531` | Part of the client's item 1 is a bug fix, not new work |
| `database/project-likas.sql` was stale — missing `weather_snapshots` and `role_change_requests` | `database/project-likas.sql` | Regenerated in `500dcaaf`, but now stale again — missing `safety_advice` and `advice_steps` |
| `verifyLocalEmail` is defined in `server/db.ts` and mocked in a test, but no router procedure calls it | `server/db.ts:108` | `emailVerifiedAt` is never set. Email verification is a dead half-feature. Not in scope for this request. |
| `admin.queueReportExport` and the `report_exports` table exist with no UI | `server/routers.ts:1145` | Not in scope for this request. |

---

## 3. Risks to resolve before development starts

### 3.1 Video upload is not a small addition

Evidence files are currently sent as **base64 inside a JSON tRPC call with a 10 MB cap**. A 30-second phone video is typically 20–100 MB. This will fail on memory and payload limits.

Required instead:
- Presigned direct-to-S3 (multipart) upload that bypasses the application server
- Client-side duration and size validation *before* upload starts
- Server-side re-validation of true mime type and size after upload (never trust client-supplied values)
- Thumbnail generation for video

Additional conflict: this must work alongside the existing **offline report queue** in `CitizenHome.tsx`. A citizen offline during a flood is exactly the person most likely to film it.

> **Resolution (2026-10-03)**: advice video is **deferred to a follow-on**; Wave 3 ships text plus step-by-step photos (US-10). Citizen **report** video (US-6) is unaffected and still blocked on OQ 5. The engineering described above is a prerequisite for both and has not been started.

### 3.2 A Valid ID is regulated personal data

Under the Philippine Data Privacy Act (RA 10173), storing a government ID requires:
- A stated **retention period**, especially for rejected applicants
- Access restricted to approved roles only
- **Audit logging** of every view
- Serving through an **authenticated, authorization-checked route**

Note: `server/storage.ts:71` returns `/manus-storage/${key}`, a proxy path. **Valid IDs must not be served this way.** The existing evidence flow uses this pattern and is not safe to reuse for IDs as-is.

---

## 4. Epics and user stories

### Epic: Citizen Registration Details

**Goal**: Capture enough identity and location data to identify Pateros residents.
**Actors**: Citizen, Administrator

---

#### US-1: Register with complete personal details

**Story**
As a citizen,
I want to give my complete name, address, age, and mobile number when I register,
so that responders and center staff know who I am and where to find me during an evacuation.

**Type**: Change to existing
**Priority**: Must

**Acceptance Criteria**

1. Happy path
   - Given I am on `/register` and selected Citizen
   - When I fill in complete name, address, age, mobile number, email, and password
   - Then my registration is saved and I see the existing "waiting for approval" status screen

2. Required fields
   - Given I leave any of complete name, address, age, or mobile number blank
   - When I submit
   - Then the form shows an error on that field and no account is created

3. Invalid values
   - Given I enter an age outside 0–120, or a mobile number that is not 10 digits
   - When I submit
   - Then the form shows a specific error on that field and no account is created

4. Backward compatibility
   - Given an existing PENDING citizen account created before this change
   - When an Administrator views it in User & roles
   - Then the account still displays with the new fields empty, and does not block approval

**Notes**
- **Builds on**: `client/src/pages/AccountRegister.tsx` (currently `name`/`email`/`password` only), `users` table
- **Requires schema change**: `users` has `phone` but needs `address` and `age`. Decision on `barangay` depends on Open Question 1
- **Business rules**: store `phone` as a string (`varchar(40)`), not an integer
- **Out of scope**: address autocomplete, barangay dropdown (depends on Open Question 1)

---

### Epic: Valid ID and Pateros Residency Verification

**Goal**: Confirm an applicant is a real Pateros resident before granting an account.
**Actors**: Citizen, Administrator

---

#### US-2: Upload a Valid ID during registration

**Story**
As a citizen,
I want to upload a photo of my government-issued Valid ID when I register,
so that the Municipality can confirm my identity and residency.

**Type**: New
**Priority**: Must

**Acceptance Criteria**

1. Happy path
   - Given I am on the registration form
   - When I select a JPG, PNG, or PDF file of my Valid ID and submit
   - Then the file is uploaded and my registration enters the approval queue with status "PENDING — awaiting ID review"

2. Accepted file types
   - Given I select a file that is not an image or PDF
   - When I attempt to upload
   - Then I see "Only JPG, PNG, or PDF is accepted" and nothing is uploaded

3. File size
   - Given I select a file larger than the configured limit
   - When I attempt to upload
   - Then I see the maximum allowed size and nothing is uploaded

4. Upload failure
   - Given the upload fails because the connection drops
   - When the failure occurs
   - Then I see a retry option, my typed details are not lost, and no account is created

5. Required
   - Given I submit the registration form with no Valid ID attached
   - When I submit
   - Then the form shows an error on the ID field and no account is created

6. Any valid ID is accepted — no whitelist
   - Given I upload a PhilSys ID, Barangay ID, driver's licence, passport, or another government ID
   - When I submit
   - Then the upload is accepted
   - **The system does not attempt to detect the document type from the image.** Because all valid IDs are accepted (OQ 2), detection would be unreliable. Staff select the type during review and the app records it.

7. The ID number is never stored in full
   - Given my ID displays a document number
   - When it is stored
   - Then only a masked form is kept (for example `1234-****-5678`), sufficient to distinguish two applicants without retaining the full number

**Notes**
- **Do not reuse `operations.uploadEvidence` as-is.** It is scoped to `risk_reports`, allows any authenticated user, and returns a publicly proxyable `/manus-storage/{key}` URL
- **Requires new table**, e.g. `citizen_id_documents` (userId, fileKey, idType, idNumberMasked, addressOnId, status, reviewedBy, reviewedAt, rejectionReason, purgeAfter)
- **Builds on**: `storagePut` in `server/storage.ts` (S3 via Forge presign)
- **`purgeAfter` carries the retention date** from section 5.1, so the cleanup job is a single indexed scan rather than a date calculation per row
- **OQ 1, 2, 3, 4 and 7 are now answered.** See section 5. Three sub-decisions in 5.2 remain open

---

#### US-3: Staff review the Valid ID and verify Pateros residency

**Story**
As Center Staff or an Administrator,
I want to view an applicant's Valid ID alongside the address on it,
so that I only approve residents of Pateros and reject everyone else.

**Type**: Change to existing
**Priority**: Must
**Note**: the title previously said "Administrator". Per OQ 7 the client extended this to **Center Staff**, which is a permissions change — see AC 5.

**Acceptance Criteria**

1. Review queue
   - Given citizen accounts are waiting for approval
   - When I open the approval queue
   - Then each pending applicant shows their Valid ID, complete name, declared address, age, and mobile number

2. Approving a verified resident — *residency is decided by the address on the ID*
   - Given the address on the applicant's ID places them in Pateros
   - When I click Approve
   - Then the account becomes APPROVED and the review is recorded in the Activity log

3. Rejecting a non-resident
   - Given the address on the applicant's ID is outside Pateros
   - When I click Decline and select a reason
   - Then the account becomes REJECTED, the reason is shown to the applicant, and the review is recorded in the Activity log

4. Insufficient evidence
   - Given the Valid ID is unreadable, cropped, or expired
   - When I click Decline with reason "Unclear or expired ID"
   - Then the applicant sees that reason and may submit a new ID

5. Center Staff may review — *new permission*
   - Given I am signed in with the `staff` role
   - When I open the approval queue and view an applicant's ID
   - Then I am allowed, and my access and decision are recorded
   - **Today `updateUserApproval` is `adminProcedure` (`server/routers.ts:1144`), which rejects any role that is not `admin`. This story requires widening it to admit `staff`.** Widening an existing admin-only procedure needs its own authorization tests.

6. Access control
   - Given I am signed in as Responder or Citizen, or I have no session
   - When I attempt to open the Valid ID review view or request the stored file
   - Then access is denied and no file is returned

7. Every ID view is audited
   - Given any staff member or administrator opens a stored Valid ID
   - When the file is served
   - Then an Activity log entry records who viewed which applicant's ID and when
   - **The file is never served from a public URL.** Requesting it is what triggers the log entry.

8. Residency is recorded, not just assumed
   - Given I approve an applicant
   - When the review completes
   - Then the address read from the ID, the staff member's decision, and the review date are all stored, so the basis for approval can be explained later

**Notes**
- **Builds on**: existing `admin.updateUserApproval` (Approve/Decline at `Home.tsx:2243`) and the `activity_logs` table
- **Business rules**: `updateUserApproval` already rejects non-citizen targets — reuse that guard
- **Security requirement**: IDs must be served through an authenticated, authorization-checked route — **not** the public `/manus-storage/{key}` proxy (`server/storage.ts:71`). This is a hard requirement, not a preference: a publicly fetchable URL for a government ID belonging to a named resident is not acceptable under any retention policy.
- **Center scoping is open** — see 5.2(b). Recommended: staff see only applicants assigned to their own centre.
- **Staff delete rights are open** — see 5.2(c). Recommended: staff approve and decline only; deleting the ID record stays admin-only.
- **Out of scope**: bulk approval, OCR of the ID number or address (see US-4). Staff read the address from the image themselves in Wave 1.

---

#### US-4: Applicant resubmits a rejected ID — *Suggested*

**Story**
As a citizen whose ID was declined,
I want to upload a clearer Valid ID without creating a new account,
so that I can still get access without starting over.

**Type**: Suggested (not requested by the client)
**Priority**: Could

**Acceptance Criteria**

1. Given my account was rejected for "Unclear or expired ID"
   - When I sign in again and open my application status
   - Then I see the reason and an option to upload a replacement ID

2. Given I upload a replacement ID
   - When I submit it
   - Then my application returns to the Administrator's pending queue and the previous ID is superseded

**Notes**
- **Why proposed**: the client asked for rejection, but not for recovery. Without it, a blurry photo means a permanently dead account. **This matters more now than it did.** OQ 2 accepts all ID types, so the system cannot verify a document is genuinely an ID — staff judgement is the only control. Residents registering during a disaster are exactly the people most likely to submit an unreadable photo, and a 30-day purge (5.1) means there is a hard window in which they can resubmit. Without US-4, a mis-scan becomes a permanently dead account with no route back.

---

### Epic: Citizen Photo and Video Evidence

**Goal**: Let citizens document an emergency with the camera on their phone.
**Actors**: Citizen, Responder, Administrator

---

#### US-5: Citizen attaches a photo to an emergency report

**Story**
As a citizen,
I want to attach a photo of what is happening to my emergency report,
so that responders can see the situation before they arrive.

**Type**: Change to existing (fixes a broken control, then extends to the citizen page)
**Priority**: Must

**Acceptance Criteria**

1. Happy path
   - Given I am a citizen on the citizen home page and have opened Report an emergency
   - When I take or choose a photo and submit the report
   - Then the report is created and the photo is attached to it and viewable by responders

2. Camera capture on mobile
   - Given I am on a phone
   - When I tap the attachment control
   - Then I am offered the camera directly, and I can still choose from my photos

3. Multiple attachments
   - Given I attach three photos
   - When I submit
   - Then all three are attached to the same report and all three appear to the responder

4. Removal before submitting
   - Given I attached a photo by mistake
   - When I tap remove on it
   - Then it is no longer attached and is not uploaded

5. No attachment
   - Given I submit a report without any attachment
   - When I submit
   - Then the report is still created successfully — attaching media is optional

6. Upload failure
   - Given my connection drops while uploading
   - When the upload fails
   - Then the report is still saved and shows as "Report sent — photo pending", and the photo retries automatically when the connection returns

**Notes**
- **Pre-existing bug to fix first**: `client/src/pages/Home.tsx:1531` — the file input stores a filename and never calls `uploadEvidence`. Nothing has ever been uploaded from the UI
- **Builds on**: `operations.createRiskReport` (returns the created id), then `operations.uploadEvidence(reportId, ...)`
- **Out of scope**: video (US-6), editing, cropping

---

#### US-6: Citizen attaches a short video to an emergency report

**Story**
As a citizen,
I want to attach a short video of the emergency to my report,
so that responders understand the situation without having to visit first.

**Type**: New
**Priority**: Must (client's #1 request)

**Acceptance Criteria**

1. Happy path
   - Given I am a citizen reporting an emergency
   - When I record or choose a video of up to 60 seconds and submit
   - Then the video uploads and is attached to my report

2. Size and duration limits
   - Given the video is longer than 60 seconds or larger than 50 MB
   - When I try to attach it
   - Then I am told the limit, and the video is rejected before any upload starts

3. Direct upload, not through the app server
   - Given I attach a large video
   - When it uploads
   - Then the file goes directly to object storage via a presigned upload and never passes through the application server as a base64 payload

4. Upload progress
   - Given a video is uploading
   - When it is in progress
   - Then I see a progress indicator and a cancel option, and I can still read or edit my report text while it finishes

5. Format support
   - Given I record on an iPhone or Android phone
   - When I attach the file
   - Then common phone formats (MP4, MOV, WEBM) are accepted

6. Playback
   - Given a responder opens a report with a video attached
   - When they open it
   - Then the video plays in the browser without downloading, and a poster image is shown before it is played

7. Failure and retry
   - Given the upload is interrupted
   - When the connection returns
   - Then the upload resumes or retries automatically and the report is not lost

**Notes**
- **This is the highest-risk story in the backlog.** The current base64-through-tRPC approach with a 10 MB cap will not work. Requires presigned multipart upload, a thumbnail generator, and client-side validation before upload
- **Business rules**: the server must re-validate true mime type and size after upload — never trust client-supplied values
- **Open Question 5** — confirm 60 seconds / 50 MB is acceptable, and that this must work on slow mobile connections
- **Out of scope**: live streaming, video editing, multiple videos per report

---

#### US-7: Responder and Administrator view report attachments — *Suggested*

**Story**
As a responder,
I want to view the photo and video attached to a report when I open it,
so that I can assess severity and the resources needed before I leave the station.

**Type**: Suggested (not requested by the client)
**Priority**: Should

**Acceptance Criteria**

1. Given a report has attachments
   - When I open the report
   - Then I see a thumbnail gallery with the photo and a video thumbnail

2. Given I am a responder
   - When I open a report assigned to me
   - Then I can play the video and open the photo full size

3. Given I am a responder and the report is assigned to another responder
   - When I attempt to open the attachments
   - Then the attachments are not shown, matching the existing rule that responders only see their assigned incidents

4. Given an attachment failed to upload
   - When I open the report
   - Then I see it marked as pending or failed, not silently missing

**Notes**
- **Why proposed**: the client only asked for the *upload*. Without a view surface, the evidence is invisible to responders and the feature delivers nothing. This is what makes US-5 and US-6 worth building

---

### Epic: Safety Advice and Preparation Media

**Goal**: Give citizens clear, actionable preparedness guidance before a disaster.
**Actors**: Administrator, Citizen
**Status**: Delivered to staging 2026-10-03 (commits `6a738a84`, `8137480e`, `a899a644`)

---

#### US-8: Administrator publishes safety advice

**Story**
As an Administrator,
I want to publish preparedness advice for each hazard — earthquake, storm, and fire,
so that citizens know exactly what to do before and during a disaster.

**Type**: New
**Priority**: Must
**Status**: Implemented and deployed to staging. The video criteria were moved to US-10 and the follow-on below.

**Acceptance Criteria**

1. Create advice as a draft
   - Given I am an Administrator
   - When I create advice for a hazard with an English title, Filipino title, English summary, English body
   - Then it is saved as a **draft** and is **not** visible to the public until I publish it

2. Hazards covered
   - Given I create advice
   - When I select a hazard
   - Then I can choose from Earthquake, Storm/Typhoon, Flooding, Fire, or General safety

3. Photo is optional
   - Given I create an advice item with text only
   - When I save
   - Then it is saved and can be published without any photo attached

4. Bilingual content
   - Given I create an advice item
   - When I leave the Filipino fields blank
   - Then citizens viewing the app in Filipino see the English text instead of an empty section

5. Publishing is gated
   - Given an item has no title, no body, or no step carrying an instruction or a photo
   - When I press Publish
   - Then publishing is refused and I am told which field is missing

6. Editing, unpublishing, archiving
   - Given an advice item is live
   - When I edit it, unpublish it, or archive it
   - Then the change takes effect for citizens, and archiving or unpublishing removes it from their view **without deleting it**

7. Access control
   - Given I am signed in as Citizen, Staff, or Responder, or I have no session at all
   - When I attempt to open the advice management view or call its endpoints
   - Then access is denied

8. Audit trail
   - Given I create, edit, publish, archive, or delete advice
   - When the action completes
   - Then it is recorded in the activity log against my user id

**Notes**
- **Built as**: `safety_advice` (slug, category, bilingual title/summary/body, `DRAFT`/`PUBLISHED`/`ARCHIVED`, `isEmergency`, `sortOrder`, `publishedAt`, `archivedAt`, `createdBy`) plus the `advice_steps` child table.
- **Follows**: the `alerts` bilingual precedent (`titleFilipino`, `messageFilipino`) and the "toggle, do not delete" rule from `alerts.isActive`, generalised into an explicit status column.
- **Category is `varchar` with a shared allowlist, not a MySQL enum**, so the DRRM office can add a hazard type without a database migration. Adding one is still a code change plus a redeploy.
- **Photo upload is admin-only**, image formats only (JPEG/PNG/WebP/GIF, 5 MB), revalidated server-side because client-supplied mime types are not trusted.
- **Open Question 6 is still unanswered and still gates the November release**: nobody has been named to author and approve the Filipino and English text.

---

#### US-9: Citizen views safety advice

**Story**
As a citizen,
I want to read simple preparation advice for earthquake, storm, and fire,
so that I know what to do before a disaster happens.

**Type**: New
**Priority**: Must
**Status**: Implemented and deployed to staging. The video criteria were moved to US-10.

**Acceptance Criteria**

1. Advice is reachable without signing in
   - Given I am on the citizen home page and not signed in
   - When I look for preparation advice
   - Then I can read it without creating an account

2. Hazard filter
   - Given I open the advice section
   - When I browse
   - Then I can filter between the hazards that have published guidance, and choose to show all

3. Non-residents can read it too
   - Given I am not a Pateros resident and have no account
   - When I read safety advice
   - Then it is served to me, because visitors evacuating through Pateros need the same instructions

4. Drafts and archived items are never exposed
   - Given an item is a draft or is archived
   - When I request the advice list, or that item directly
   - Then it is not returned

5. Language toggle
   - Given I have switched the app to Filipino
   - When I open the advice
   - Then I see the Filipino title, summary, body, and step text, falling back to English field by field

6. Accessibility
   - Given I use the "Read this page" text-to-speech control
   - When I am on the advice section, or on a single advice item
   - Then the advice text is read aloud in my selected language

7. Large text mode
   - Given I have turned on larger text
   - When I read the advice
   - Then the text remains fully usable and nothing is cut off

8. Offline
   - Given I have no internet connection
   - When I open previously viewed advice
   - Then I see a clear message, and the guidance already cached on the device remains readable

9. Empty state
   - Given an Administrator has not published advice for a hazard yet
   - When I open the advice section
   - Then I see a clear message that guidance is not available yet, not a blank screen

10. Urgent guidance is pinned first
    - Given an Administrator has marked an item urgent
    - When I open the advice section
    - Then that item appears above the rest

**Notes**
- **Delivered under the original 7–9 day estimate** because it reuses existing citizen infrastructure: the `speakText` TTS helper, the `largeText` toggle, the language toggle, the `citizenCopy` bilingual fallback, and the `likas-cached-centers` offline cache pattern (mirrored as `likas-cached-advice`).
- **Access rule**: `advice.list` and `advice.detail` are `publicProcedure`; authoring is `adminProcedure`. Locked down by `server/advice-router.test.ts`.
- **Business rules**: mirror the existing `getRiskReportHeadline` / `citizenCopy` fallback convention — never show an empty Filipino block.
- **Out of scope**: personalising advice by household profile, quizzes, certification.

---

#### US-10: Administrator attaches step-by-step photos — *client substitute for video*

**Story**
As an Administrator,
I want to attach a photo to each step of my safety advice,
so that residents who are panicking, or who read more easily with pictures than text, can follow the guidance visually.

**Type**: New
**Priority**: Must (for November)
**Status**: Implemented and deployed to staging.
**Origin**: Not an analyst invention. The client asked for videos; when the cost was raised they offered step-by-step photos instead.

**Acceptance Criteria**

1. Steps stay ordered
   - Given an advice item has several steps
   - When I reorder or remove them in the editor
   - Then the numbering that gets saved matches the order I see, starting at 1, with no gaps

2. Blank steps are discarded
   - Given I left a step completely empty
   - When I save
   - Then it is discarded rather than creating an empty instruction

3. One photo per step
   - Given I attach a photo to a step
   - When I save and a citizen opens the advice
   - Then the photo appears beside that step's text

4. Photo formats and size are enforced
   - Given I attach a file that is not a JPEG, PNG, WebP or GIF, or one over 5 MB
   - When I upload it
   - Then the upload is refused with a clear message

5. Photo is optional per step
   - Given some steps have photos and others do not
   - When I publish
   - Then publishing still succeeds

6. A photo alone is enough to publish
   - Given a step carries a photo but no written instruction
   - When I publish
   - Then the item is publishable

**Notes**
- **Built as**: `advice_steps` (`adviceId`, `stepNo`, `title`, `titleFilipino`, `instruction`, `instructionFilipino`, `imageUrl`, `imageKey`) with a composite index on `(adviceId, stepNo)` and `ON DELETE CASCADE`. Modelled as a child table rather than a JSON column so steps can be reordered, validated and queried independently.
- **Steps are replaced wholesale on save** so reordering in the editor cannot leave duplicate or orphaned rows.
- **Placeholder content is seeded as drafts only.** `server/seed-advice.ts` writes three generic items for demo and QA purposes; publishing them requires an explicit `--publish` flag. The seeded wording is marked as a placeholder and **must be replaced by the DRRM office**, not shipped as official guidance.

**Follow-on, not estimated and not started — advice video**
The video acceptance criteria originally written into US-8 and US-9 are not delivered and are not abandoned. A follow-on estimate should cover: presigned multipart direct-to-S3 upload, a poster thumbnail, captions, bandwidth-aware playback, and offline handling. Prerequisite engineering is described in section 3.1.

---

## 5. Open Questions

### Answered

| # | Question | Client answer | Closed |
|---|---|---|---|
| 1 | How is "taga Pateros" proven? | **The address on the Valid ID.** Staff check whether the address places the applicant in Pateros. | 2026-10-03 |
| 2 | Which IDs are accepted? | **All types of valid ID**, explicitly including PhilSys, Barangay ID and driver's licence. Not a fixed whitelist. | 2026-10-03 |
| 3 | How long are Valid IDs stored? | **Two-tier retention, accepted from our recommendation** — see 5.1 below for the exact periods and rationale. | 2026-10-03 |
| 4 | Is the existing Gmail-only registration rule still correct? A senior citizen registering for evacuation support may not have a Gmail address. | **Yes — keep Gmail-only.** | 2026-10-03 |
| 7 | Should the Valid ID be visible to Evacuation Center Staff, or Administrators only? | **Center staff.** They can view the ID and approve or decline. This supersedes the earlier "only Administration" answer. | 2026-10-03 |
| 11 | `database/project-likas.sql` is stale and missing two tables. | Regenerated from the live schema in commit `500dcaaf`. | 2026-10-02 |

> **Wave 1 is no longer blocked.** OQ 1, 2, 3 and 7 are answered. US-2 and US-3 can start. Three sub-decisions remain open — see 5.2.

### 5.1 Retention policy (OQ 3, accepted)

| Case | Retention |
|---|---|
| **Approved applicant** | Retain the ID image while the account is active. Delete 1 year after the account is deactivated. |
| **Rejected applicant** | Delete the ID image after **30 days**. Long enough to investigate an appeal or a mis-scan; short enough to defend as "not indefinite". |
| **Abandoned upload** (never reviewed) | Delete after **30 days** by a scheduled cleanup job. |

Rationale recorded for the client: RA 10173 requires personal data to be kept no longer than necessary for a stated purpose, and requires a specified retention period. Every retained ID is an image of a government document usable for identity fraud, so the stored footprint is kept as small as the operational need allows.

The 30-day figure was chosen over "delete immediately on decline" because residents registering during a disaster are likely to submit blurry or partially readable ID photos, and an immediate delete would force a re-upload and a second queue for a mis-scan.

### 5.2 Open sub-decisions — needed before US-2/US-3 are finished

These do not block starting the work. Each is small, but each changes behaviour.

| # | Question | Our recommendation |
|---|---|---|
| a | An ID shows "Pateros, Metro Manila" but **no barangay**. Accept, or hold for clarification? | Accept it as Pateros. Rejecting a genuine resident over a missing barangay line is the worse failure. |
| b | Is staff access to IDs **scoped to their own centre**, or all residents everywhere? | Centre-scoped. A staff member at one centre should not see applicants who applied elsewhere. |
| c | May staff **delete** an ID record, or only approve/decline? | Approve/decline only. Delete is irreversible and stays admin-only. |

Also note: because OQ 2 accepts all valid ID types, the system cannot reliably detect the ID type from the image. Staff select the type when reviewing, and the app records it. Confirm that is acceptable rather than attempting automatic detection.

### 5.3 Blocking — cannot build without an answer

None. OQ 1, 2, 3 and 7 were all answered on 2026-10-03.

### Needed before build

| # | Question | Affects |
|---|---|---|
| 5 | Are 60 seconds and 50 MB acceptable for citizen video? Will this be used on low-end phones with unstable mobile data? **The client answered "kahit ilan second" — "any number of seconds" — which sets no limit at all and is not implementable as written. A cap has to be agreed.** | US-6 |
| 6 | Who writes and approves the Filipino and English advice text? This is content work with a subject-matter expert, and it gates the November release. **Still unanswered.** | US-8, US-9, US-10 |
| 8 | Should a citizen be able to attach media *after* submitting a report, not only during? The client's "Yes" is ambiguous between "yes, after submitting" and "yes, the citizen reports it". | US-5, US-6 |
| 9 | Do these new fields need to appear in admin reports and exports? | US-1 |
| 12 | **What should happen to a citizen who registers without a Valid ID?** Today they are locked out: `login` refuses a `PENDING` account and `completeApproval` only issues a session once the account is `APPROVED`, so they cannot sign in, cannot upload an ID later, and leave nothing in the staff review queue. Three options: (a) require an ID at registration, which contradicts the ID being optional; (b) let a `PENDING` citizen sign in but restrict them to the ID upload screen; (c) show ID-less accounts in the review queue as "no ID submitted" so staff can act. **Not yet raised with the client.** | US-2, US-3 |
| 13 | **Where should resident files be stored in production?** Staging now uses a Railway volume. For production we recommend an S3-compatible bucket (Cloudflare R2 has no egress fees, which matters for a government budget). That needs someone to own the bucket, set the credentials in the Railway dashboard, and accept the data-residency question for resident IDs. | US-2, US-5, US-10 |

> **New risk from OQ 2.** Accepting all ID types means the app cannot verify that a document is genuinely an ID. Staff judgement becomes the control. This raises the value of two things the client has not yet asked for: a confirmation step before a decline is final, and a record of *why* staff declined. Both are cheap to build. Neither is currently in scope.

### Flagged for the client, not blocking

| # | Note |
|---|---|
| 10 | Client item 1 is partly a **bug fix**, not a new feature. The photo upload control in the internal report form has never worked — `client/src/pages/Home.tsx:1531` captures a filename and never calls the mutation. Worth telling them so they know part of that work is smaller than expected. |
| 11 | **A resident who registers with no ID at all cannot sign in.** The Valid ID is optional at registration, but a `PENDING` citizen is refused by `login` and `completeApproval` only issues a session once the account is already `APPROVED`. So a resident who registers without attaching an ID has an account nobody can reach and no document in the review queue. Staff can force-approve via `updateUserApproval`, but that is a manual override nobody will think to use. Needs a client decision — see OQ 12. |
| 12 | **Resident files were being written to the container filesystem.** No Railway volume was attached, so every upload would have been discarded on the next deploy. A volume is now attached at `/data`, but no real resident data should be entered until persistence is confirmed against a live deploy. |

### Proposed by us — pending client confirmation

These were analyst decisions, not client instructions. They are implemented and live on staging. If the client disagrees, the change is cheap now and expensive after the DRRM office has authored real content.

| # | Proposal | Status |
|---|---|---|
| P1 | **Advice is public — no login required.** Anyone can read published guidance, including non-residents sheltering in Pateros. | Built and deployed. Confirm. |
| P2 | **Two extra hazard categories**: `FLOOD` and `GENERAL`, beyond the earthquake/storm/fire the client named. Pateros floods; some guidance is not hazard-specific. | Built and deployed. Confirm or remove. |
| P3 | **Publishing is gated**: an item needs a title, summary and body, plus at least one step with an instruction or a photo. | Built and deployed. |
| P4 | **DRAFT → PUBLISHED → ARCHIVED**, with archived items returnable to draft for revision. Nothing is hard-deleted from the admin view. | Built and deployed. |
| P5 | **Category is a validated list, not a MySQL enum**, so the DRRM office can add a hazard type without a database migration. | Built and deployed. |
| P6 | **BFP is handled by the existing `responder` role**; no new role was created. | Built. Confirm in writing. |

---

## 6. Summary

| Story | Title | Type | Priority | Requested by client | Status |
|---|---|---|---|---|---|
| US-1 | Register with complete personal details | Change | Must | Yes (item 3) | **Done** (`4a0de779`) |
| US-2 | Upload a Valid ID during registration | New | Must | Yes (item 4) | **Unblocked** — ready to start |
| US-3 | Staff review the Valid ID and verify Pateros residency | Change | Must | Yes (item 4) | **Unblocked** — ready to start |
| US-4 | Applicant resubmits a rejected ID | Suggested | Should | No | Not started — raised in priority, see US-4 notes |
| US-5 | Citizen attaches a photo to an emergency report | Change | Must | Yes (item 1) | Not started (UI is broken today) |
| US-6 | Citizen attaches a short video to an emergency report | New | Must | Yes (item 1) | Blocked on OQ 5, 8 |
| US-7 | Responder and Administrator view report attachments | Suggested | Should | No | Not started |
| US-8 | Administrator publishes safety advice | New | Must | Yes (item 2) | **Done** (`6a738a84`) |
| US-9 | Citizen views safety advice | New | Must | Yes (item 2) | **Done** (`6a738a84`) |
| US-10 | Administrator attaches step-by-step photos | New | Must | Yes — offered as a substitute for video | **Done** (`6a738a84`) |

**Total: 10 stories** (8 requested by the client, 2 marked Suggested). **3 delivered**, **2 unblocked and ready to build**, **1 blocked**, **4 not started**.

US-4 and US-7 are analyst proposals, not client requests. **US-4's priority is raised from Could to Should** — accepting all ID types (OQ 2) means staff judgement is the only control on whether a document is genuinely an ID, and a mis-scan currently has no recovery path.

US-8, US-9 and US-10 ship **text and photos**. The advice **video** the client originally asked for is not delivered — it is a follow-on requiring its own estimate (see section 3.1).

US-8, US-9 and US-10 ship **text and photos**. The advice **video** the client originally asked for is not delivered — it is a follow-on requiring its own estimate (see section 3.1).

---

## 7. Delivery waves and estimates

### Wave order was changed

The waves were originally sequenced bottom-up. They were **reordered to run 3 → 2 → 1** so that the advice feature lands first, because the client has a **November defence deadline** and safety advice is the most demonstrable part of the request.

| Wave | Contents | Original order | Status |
|---|---|---|---|
| **Wave 3** | US-8, US-9, US-10 — safety advice with step photos | 3rd | **Delivered to staging** |
| **Wave 2** | US-5, US-6, US-7 — photo/video evidence on reports | 2nd | Not started, blocked on OQ 5 and 8 |
| **Wave 1** | US-1, US-2, US-3, US-4 — registration details and Valid ID verification | 1st | US-1 done; **US-2 and US-3 unblocked as of 2026-10-03 and ready to build** |

**The exact November date is still unknown.** "By November" leaves a 3.5-week swing, which is larger than Wave 3 itself. The date needs confirming before the remaining schedule means anything.

### Wave 1 scope grew after the answers

The 10–13 day estimate for Wave 1 assumed a single reviewer role and an undecided retention policy. Three things changed on 2026-10-03:

- **Center Staff gained review rights** (OQ 7). `updateUserApproval` is currently `adminProcedure`; admitting `staff` means a new authorization tier, per-centre scoping, and its own test coverage.
- **Retention became a requirement** (OQ 3). Two tiers plus a scheduled purge job, with `purgeAfter` set at write time so cleanup is an indexed scan.
- **IDs must not be publicly fetchable.** `storagePut` returns a `/manus-storage/{key}` proxy URL (`server/storage.ts:71`). Storing government IDs through that path is not acceptable, so an authenticated, authorization-checked, audit-logging serving route is required.

Wave 1 should be re-estimated once the three sub-decisions in 5.2 are settled. A preliminary figure is **13–17 days**, up from 10–13 — the retention and audit work is new scope, not a refinement of the original estimate.

### Estimates

| Wave | Scope | Estimate (person-days) |
|---|---|---|
| Wave 1 | US-1, US-2, US-3, US-4 | **13–17** *(re-estimated after the 2026-10-03 answers; was 10–13)* |
| Wave 2 | US-5, US-6, US-7 | 13–17 |
| Wave 3 | US-8, US-9, US-10 | 7–9 |
| **Subtotal, feature work** | | **33–43** |
| Cross-wave integration, end-to-end QA, handover, deployment | | 5–6 |
| **Total** | | **38–49** |

This resolves an inconsistency in the original figures: the waves summed to 30–39 while the headline figure was 35–45. The 5–6 day gap is **cross-cutting work** — integrating the three waves against each other, end-to-end QA, and handover — not feature work inside any single wave. It is named here so the two numbers can be reconciled.

Wave 1 was re-estimated upward on 2026-10-03 because the answers added scope rather than removing it — see "Wave 1 scope grew after the answers". The total moved from 35–45 to **38–49 days**.

### Two things the estimate does not cover

**1. Advice content.** Wave 3's 7–9 days buys the *machinery* — the authoring workspace, the publish gate, the public view, photo upload. It does not buy the **Filipino and English safety wording**. That is content work with a subject-matter expert, it has no owner, and it sits directly on the November critical path (OQ 6). If it is not assigned now, the feature will be technically complete and publicly empty on the day. Estimate **1–2 weeks of non-development effort**, or more if the material has to be drafted from scratch rather than adapted.

**2. Advice video.** Deferred. Needs its own estimate before it can be scheduled.

### Wave 3 came in under estimate

US-9 landed cheaper than the 7–9 day figure because it reused existing citizen infrastructure — the `speakText` TTS helper, the large-text toggle, the language toggle, the bilingual `citizenCopy` fallback, and the existing offline cache pattern — instead of building parallel versions of each. The remaining budget was spent on the admin authoring workspace and the publish gate.

---

## 8. References

- Epic 1–4 map to the client's four requests in section 1
- Business rules reused from existing behaviour: transactional occupancy in `server/db.ts`, report status machine in `shared/operations.ts` (`canTransitionReport`), alert audience targeting in `shared/operations.ts` (`alertsVisibleToRole`), bilingual fallback in `shared/citizen.ts` (`citizenCopy`, `getRiskReportHeadline`)
- Existing citizen approval flow: `localAuth.register` → `localAuth.checkApproval` → `admin.updateUserApproval` (`server/routers.ts`)

### Wave 3 implementation map

| Concern | File |
|---|---|
| Domain logic — bilingual fallback, status machine, publish gate, slug generation | `shared/advice.ts` |
| Schema — `safety_advice`, `adviceSteps` | `drizzle/schema.ts` |
| Migration | `drizzle/0013_safety_advice.sql` |
| Data access, transactional step replacement | `server/db.ts` |
| Endpoints — public `list`/`detail`, admin authoring | `server/routers.ts` |
| Admin authoring workspace | `client/src/pages/Home.tsx` |
| Public citizen view | `client/src/pages/CitizenHome.tsx` |
| Placeholder content seeder | `server/seed-advice.ts` |

### Test coverage

| Suite | Tests | Covers |
|---|---|---|
| `shared/advice.test.ts` | 22 | Bilingual fallback, status transitions, publish gate, slug uniqueness, step normalisation, mime/size rules |
| `server/advice-router.test.ts` | 12 | Public read is unauthenticated; every authoring, status-change, delete and upload path refuses non-admins |
| Total project suite | 112 | `pnpm check`, `pnpm test`, `pnpm build` all green |

### Delivery record

| Commit | Contents |
|---|---|
| `34642211` | This backlog document |
| `4a0de779` | US-1 registration details, migration `0012` |
| `500dcaaf` | Evidence upload UI fix, `database/project-likas.sql` refresh |
| `541bfe86` | Test-runner include fix; whitespace bug in `citizenReportTypeFromDanger` |
| `6a738a84` | Wave 3 — US-8, US-9, US-10 |
| `8137480e` | Seed script explicit exit |
| `a899a644` | Seed script idempotency fix |

Staging: `https://comfortable-youth-staging.up.railway.app` — all 15 migrations applied and tracked.

### Wave 1 delivery record

| Commit | What |
|---|---|
| `7975e6af` | US-2/US-3 first pass: `citizen_id_documents` table, `users.deactivatedAt`, migration `0014`, domain logic with retention, server routes, registration upload, review workspace |
| `99d322de` | Fix for the ID verification page crash (see below) |
| tag `wave-1-complete` | Wave 1 checkpoint |
| tag `wave-1-hotfix-1` | ID verification crash fix |

**Three defects found by client testing after the Wave 1 deploy.** All three are recorded because the pattern matters more than the individual bugs: every one of them passed typecheck and passed its tests, and all three were found only by a person clicking.

1. **`railway up` does not run migrations.** Deploying the code without applying `0014` left the database without `users.deactivatedAt`, so *every login failed for all 13 accounts* with a raw SQL error. Fixed by applying `0014` through the container and recording it in `__drizzle_migrations`. **This will recur on every deploy that includes a migration** and needs a decision before Wave 2.
2. **A nav item with no descriptor crashed the whole page.** `Home.tsx` returns early for `Overview`, so `Overview` was never a key in the `data` record — meaning the fallback `data[active] ?? data.Overview` resolved to `undefined` for any workspace lacking a descriptor, and `view.rows` threw. The fallback is now an explicit empty view, which also fixed the same latent crash on `Security` for responders. *Residual:* responders now see an empty table on `Security` rather than a crash. That workspace needs a real implementation.
3. **No file upload had ever worked.** `server/storage.ts` was the Manus WebDev template's storage adapter, gated on `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`, which are not set on Railway and cannot be obtained. Every call to `storagePut` threw. This affected **all three upload features** — Valid IDs (Wave 1), risk report evidence (earlier wave), and safety advice step photos (Wave 3). Wave 3's step photos have never worked.

### Storage decision

The original adapter would have sent resident government IDs to a third-party development platform. **That was not acceptable and was not done.** Valid IDs are sensitive personal information under the Data Privacy Act (RA 10173), and routing them to an unapproved external service is not a decision we can make.

`server/storage.ts` is now a backend interface with two implementations behind one set of call sites:

- **Volume** (active on staging) — files on a Railway volume. No credentials, no third party. `getSignedUrl` mints a short-lived HMAC URL served by `GET /api/upload/*`, which refuses any request without a valid signature.
- **S3-compatible** — selected automatically when `S3_BUCKET` and credentials are set. Presigned URLs work as written.

A Railway volume is now attached at `/data`. On startup the server warns loudly if uploads would land on an ephemeral filesystem. Migration to a bucket is tracked as OQ 13.

**Registration behaviour changed.** The ID was previously validated and stored *before* the account was created, so a bad upload failed registration outright. That was sound in principle, but a storage outage then destroyed everything the resident had typed. The account is now created first and the ID attached second; on failure the resident keeps their account and retries on the same screen via `localAuth.uploadPendingId`, authorized by the registration approval token. The token is used because a `PENDING` citizen cannot sign in by any route, so an account created without an ID would otherwise be permanently stuck.

### Test coverage

| Suite | Tests |
|---|---|
| `shared/idVerification.test.ts` | 34 |
| `server/id-verification-router.test.ts` | 18 |
| `server/storage.test.ts` | 33 |
| Full suite | 197 passing across 18 files |

### Storage verification on live staging

Every step below was exercised against the deployed service, not just locally. Two QA accounts were created for the run and both have been removed, along with their files and rows.

| Check | Result |
|---|---|
| Railway volume attached | `/data`, `RAILWAY_VOLUME_MOUNT_PATH` injected and picked up automatically |
| Register with a Valid ID | 200, `idDocumentId: 1`, `idUploadFailed: false` |
| File on disk | `/data/uploads/citizen-ids/20/id_f2be769c.png`, 70 bytes — **on the volume, not the container filesystem** |
| Review queue | Lists the pending document for an admin |
| `imageUrl` then fetch | 200, 70 bytes, `Content-Disposition: attachment` |
| Unsigned URL to the same file | 403 |
| Path traversal with a forged signature | 403 |
| Pending citizen signing in | 403 *"waiting for Administrator approval"* — confirms why the retry route is needed |
| `uploadPendingId` with the approval token | 200, document created |
| `uploadPendingId` with a forged token | 401 |
| Cleanup | 0 QA accounts, 0 documents, 0 orphan credentials |

Two PENDING citizens already exist in staging from manual testing (`test1234@gmail.com`, `test1235@gmail.com`) with **no ID document on file**. They are live examples of the trap in note 11 and cannot sign in. They should be deleted or resolved before the client demo.

---

## 9. Decision record - 2026-10-04

Closed at commit `dfef7bb4` (tag `secrets-untracked-1`). This section records the credential exposure found while sweeping for committed secrets, and the three decisions to be taken with the client.

### 9.1 Committed secrets in the public repository

A sweep of every tracked file turned up **two** exposures, not one. Both were pushed to a public repository.

| Path | Size | Contents | Status |
|---|---|---|---|
| `.env.bak` | small | A live `JWT_SECRET` (44 chars). `DATABASE_URL` was `127.0.0.1`, `root`, no password - harmless local dev only | Untracked, `dfef7bb4` |
| `.manus-logs/networkRequests.log` | 867 KB | Captured browser traffic including **login POST bodies** | Untracked, `dfef7bb4` |
| `.manus-logs/sessionReplay.log` | 746 KB | UI session replay; 0 password *values*, its 102 "password" hits are field labels | Untracked, `dfef7bb4` |
| `.manus-logs/browserConsole.log` | 757 KB | Browser console output | Untracked, `dfef7bb4` |

Severity of the log exposure: **one real 10-character password, submitted alongside 20 real email addresses.** Five accounts appear with it:

| Account | Present in staging |
|---|---|
| `admin@likas.local` | No - client-side demo credential, never created server-side |
| `staff@likas.local` | No - same |
| `responder@likas.local` | No - same |
| `citizen@likas.local` | No - same |
| **`juswamacailao@gmail.com`** | **Yes - a real admin account** |

The email and the password are both present, so this is directly actionable rather than theoretical. **Remediation outstanding, requires dashboard access:** change the password for `juswamacailao@gmail.com` and rotate `JWT_SECRET` in Railway.

No `Authorization` header values and no `Set-Cookie` values were captured, so the exposure is one credential, not a session token.

Root cause: `vite.config.ts` registers a debug collector that posts browser console output, network request bodies and session replay to `/.manus__/logs`, and the plugin writes them to disk. Nothing prevented the output from being committed.

### 9.2 Hardcoded demo credentials - investigated and cleared

The leaked 10-character password matches the length of the credentials in `client/src/lib/staticAuth.ts:5-8`, which is a **client-side authentication bypass on inspection**: `authenticateStaticAccount` grants `role: "admin"` from a string comparison with no server call.

It is **not reachable in production.** Verified, not assumed:

| Check | Result |
|---|---|
| `Login.tsx:88` gates the path | `if (!import.meta.env.DEV) return;` |
| Authority of the static session | None - reads and writes `localStorage` demo data only (`Home.tsx:233`), never reaches the server |
| Live production bundle, 359 KB fetched from staging | `Admin@12345`, `admin@likas.local`, `static-local`, `likas-static-user` all **absent** |

Vite replaces `import.meta.env.DEV` with `false` and tree-shakes the module out of the production build.

Residual risk is low but real: the fixed credentials remain readable in public git history, and the code is a latent bypass if the `DEV` guard is ever removed or a dev-mode build is shipped. Recommendation is to delete the fixed `staticRoleCredentials` block and keep only the sound server-side mechanism, `provisionDemoAccount` (`db.ts:43`), which issues `demo.<role>.<hex>@likas.training` with a random password, hashed at cost 12 and expiring.

### 9.3 The three decisions to take with the client

Nine open questions will not get answered. Grouped by what actually blocks:

**Decision 1 - the schedule.** Ask for **two** dates, not one: which date must it be live, and which date is the demo. Plan against the earlier one. "By November" is a 3.5-week swing.

Bundled with it: **who writes the advice content (OQ 6).** Ask for a named person and a date, not "we will assign someone." Offer to draft it: Wave 3's machinery is live, the wording is missing, and SME authoring is 1-2 weeks of elapsed time. We can produce reviewable English and Filipino drafts from official Philippine sources (PAGASA, NDRRMC, OCD) in 2 days, held in `DRAFT` until their office signs off. Their expert reviews and corrects wording; ours does not publish anything as authoritative.

**Decision 2 - video in or out (US-6).** Recommendation is to cut it from this release. The caps are undefined - OQ 5 was answered *"kahit ilan second"*, which is not implementable - and it is the only Must item with a clean deferral. US-5 and US-7 photo evidence carries the evidentiary value. If a slot is held for video, we need length, size and file-count caps plus a date.

The argument to make is a mission argument, not a technical one: a large video on congested mobile data during a typhoon is the case most likely to fail to upload, and a failed upload loses the evidence, which defeats the purpose of attaching evidence in an emergency.

**Decision 3 - production readiness.** These must not be discovered late.

- **OQ 13, storage.** Move to an S3-compatible bucket. The current arrangement stores resident files on the disk attached to the application service; for a disaster response app, the disaster can take out the data along with the service. RA 10173 also requires us to state where personal data physically sits. Needed from them: who owns and pays for the bucket, and which jurisdiction.
- **OQ 12, residents with no ID.** See 9.4.1.
- **BFP = `responder`, in writing.** Confirm whether BFP need to **approve** registrations and **view ID documents**, or only view reports. This is not a formality: the `responder` role is not currently in the ID-verification workspace allowlist, so BFP cannot open that screen today.

### 9.4 Architecture of the resulting changes

**9.4.1 PENDING limited access - resolves OQ 12 and the trap in note 11**

Current behaviour is a dead end: registration succeeds, `login` refuses a `PENDING` citizen, `completeApproval` only issues a session once the account is `APPROVED`, and no document exists in the review queue.

| Layer | Change |
|---|---|
| `shared/idVerification.ts` | Add a capability set for `PENDING`, alongside the existing status helpers |
| `localAuth.login` | Issue a session for `PENDING` instead of refusing, flagged `deactivatedAt: null, idDocument: null` |
| Session claims | Carry the document state so the client can gate without a second round trip |
| `Home.tsx` | `PENDING` lands in a limited citizen view: safety advice and centre information readable, report submission disabled, persistent prompt to attach an ID |
| Report mutations | Reject `PENDING` server-side as defence in depth, not only in the UI |
| Review queue | Unchanged - a document still appears once attached |

Net effect: no resident is locked out for lacking documents, and unverified accounts still cannot file the records that matter. Approximately one day.

**9.4.2 Production bucket - OQ 13, configuration only**

`server/storage.ts` is already a backend interface. `getStorage` selects the S3 backend when `S3_BUCKET` is set and the volume backend otherwise, and `warnIfStorageIsEphemeral()` fails loudly at startup if uploads would land on an ephemeral filesystem. Migration is therefore environment variables plus a smoke test - **no code change and no migration script.** The constraint to raise with the client is bucket ownership and jurisdiction, not engineering.

**9.4.3 Deploy gate - prevents the failure that happened twice**

Both severe incidents shared one root cause: a documented manual step with nothing enforcing it. Migration `0014` was never applied and broke login for all 13 accounts; uploads were silently dead because storage was unconfigured. Both shipped green and were found by clicking.

Proposed, in order, failing fast:

1. `drizzle-kit migrate` inside the running container - migrations land **before** new code, because forward-only migrations are tolerated by the old code and the reverse is what broke login
2. `railway up`, only if step 1 succeeded
3. Smoke test against live staging, only if step 2 succeeded

| # | Check | Catches |
|---|---|---|
| 1 | `GET /` returns 200 | Deploy did not come up |
| 2 | `GET /api/trpc/advice.list` returns 200 | Public read broken |
| 3 | **`localAuth.login` with a wrong password returns 401 "Invalid email or password"** | **Schema drift.** A non-existent email still runs the `SELECT`, which is what surfaces `Unknown column`. No credentials needed, and it distinguishes "query ran and rejected the password" from "the schema is wrong" |
| 4 | `idVerification.queue` returns 401 anonymously | Route missing or auth regressed |
| 5 | `GET /api/upload/...` unsigned returns 403 | Storage route not wired. A 403 means the route is alive and rejected the signature; a 404 means it is missing |

Must be proven to fail by deliberately breaking something. A smoke test never observed failing is not a smoke test.

**9.4.4 US-5 scope corrected - OQ 8 gates US-5, not only US-6**

OQ 8 asks whether media may be attached **after** submission. Two readings, two different builds: attaching during submission is required under every reading; attaching afterwards is a separate endpoint, a management UI on an existing report, and a permission decision.

| Reading | Scope |
|---|---|
| "Yes, after submitting" | During-submission UI **plus** a post-submission endpoint, attachments management UI, and a rule for who may attach to an existing report |
| "Yes, the citizen reports it" | Unclear; needs restating |

Decision: build **during-submission only** for this release and defer post-submission. US-5 is then unblocked and OQ 8 stops being a schedule risk.

### 9.5 Defaults we will adopt and simply inform the client

Not worth spending goodwill on a question. State them in one line and let the client object:

| | Default | Reasoning |
|---|---|---|
| **OQ 9** | **Yes** - ID *type* and *verification status* appear in admin reports and exports. ID **images** and ID numbers are excluded from exports by default | Staff need verification state to follow up. Exporting resident ID images by default is a privacy exposure nobody asked for |
| **OQ 5** | 60 seconds, 50 MB, one file | See Decision 2. The question itself flags low-end phones and unstable data |
| **OQ 8** | During submission only this release | The build required under every reading is identical |

### 9.6 Revised critical path

| Order | Item | Blocked on | Duration |
|---|---|---|---|
| 1 | Client message: two dates, content owner, video in/out | The user, today | 30 min |
| 2 | Deploy gate (9.4.3) | Nothing - start immediately | Half a day |
| 3 | Credential rotation and password change | The user, dashboard | 2 min |
| 4 | US-5 + US-7 photo evidence | Nothing, given the 9.4.4 decision | 3-5 days |
| 5 | Advice content drafts (English + Filipino) | Hazard categories confirmed | 2 days, then client review |
| 6 | PENDING limited access (9.4.1) | Nothing | 1 day |
| 7 | US-6 video | Caps **and** a date | 3-5 days if unblocked |

The binding constraint is item 5, because it is the only item whose lead time belongs to somebody else. Engineering lead time is compressible; a subject-matter expert's calendar is not. If content ownership is not assigned this week, the safety advice feature ships complete, working and empty.

### 9.7 Draft message to the client

Draft for the user to edit and send. Not sent on their behalf.

> Good day. Three items so we can lock the schedule.
>
> **1. Two dates.** Which date must the system be live, and which date is the demonstration? We will build to the live date so that your training window opens on a finished system.
>
> **2. Safety advice content - an offer.** The publishing system for safety advice is built and live. What remains is the Filipino and English wording, which is subject-matter content we should not write and sign off ourselves. Rather than wait, we can draft all items from official PAGASA, NDRRMC and OCD guidance in about two working days. They stay unpublished until your office reviews and approves each one. Your hazard officer would be correcting and approving wording already in front of them, not writing from a blank page. Could you name the person who will review, and the date we should send the drafts?
>
> **3. Photo and video evidence.** Photo evidence is ready to build. Video needs an agreed maximum length, file size and file count before we can implement it, so we ask: do you want video in this release, or in the following one? Our concern is specific rather than general - a large video is least likely to finish uploading when mobile data is congested during a storm, and a failed upload loses the evidence entirely. We recommend a 60-second, 50 MB limit. If you would like video included, we need the limits and a date agreed by [DATE] to hold the slot.
>
> Two further points for before go-live, no action needed yet: production file storage needs an agreed owner and jurisdiction, because resident ID documents must not sit on the disk of a single application server; and we need written confirmation of what BFP personnel are permitted to do in the system, specifically whether they approve resident registrations and view ID documents.
## 10. Verification findings - 2026-10-04

> **Status: not client-approved.** Everything in this section is an internal finding or an unreviewed recommendation. Nothing here has been sent to the client, and nothing here should be forwarded until the user has reviewed it and decided. Items marked UNREVIEWED are recommendations only.

This section exists because headless browser verification became available late in the day. It immediately found defects that 206 passing unit tests, a clean typecheck and every HTTP check had all missed. That is the third time in this project that a check suite has been green while a real user-facing path was broken.

### 10.1 What changed

| Item | Detail |
|---|---|
| Tool | `puppeteer-core` driving the Chrome already installed on the machine, in a throwaway temp profile. Dev dependency only; nothing in the application imports it. |
| Scripts | `scripts/browser-check.mjs` (9 smoke checks), `scripts/verify-change-password.mjs` (end-to-end account flow), `scripts/dump-form.mjs` (DOM introspection for selectors) |
| Access | A fresh temporary profile. It cannot read the operator's tabs, cookies, history or saved logins, and it only ever visits the URL in `BASE_URL`. |
| Result | `browser-check.mjs` is 9 of 9 with 0 console errors. `verify-change-password.mjs` is blocked, for the reason in 10.4. |

### 10.2 Defect found and fixed: 502 on every page load

`client/index.html` carried the template's analytics tag with `%VITE_ANALYTICS_ENDPOINT%` left unsubstituted. Every page load requested `/%VITE_ANALYTICS_ENDPOINT%/umami`, received a 502, and logged a console error on resident-facing pages. Invisible to typecheck, to unit tests and to every HTTP check, because it only exists inside a browser. Replaced with a comment explaining how to enable analytics properly. Fixed in `4a47f1af`.

### 10.3 Finding, unresolved: 358 KB of unused inline script on every page

> **Status: DECIDED and built 2026-10-05.** Option 1 was taken, keeping the plugin in
> development only. Measured outcome and verification in 11.2. The analysis below is
> preserved exactly as written on 2026-10-04, before the decision.

The built `index.html` is 359 KB, of which **358.5 KB is a single inline `<script id="manus-runtime">` block** injected by `vitePluginManusRuntime()` in `vite.config.ts`. Our own source contains no reference to it. It is forge tooling, not application code.

| Measure | Value |
|---|---|
| Inline runtime | 358.5 KB per page load, uncompressed, blocking the main thread |
| Whole `index.html` gzipped | 105.6 KB |
| Application JS gzipped | 353.8 KB |
| Total first-load transfer | roughly 498 KB gzipped |

This is forge tooling, not application code, and its cost lands on exactly the environment the client cares about: a low-end phone on congested mobile data during a storm.

**UNREVIEWED - two options for the user to choose between:**
1. Keep the plugin in development only, so Manus previews still work but production drops it. Recovers 358 KB per page load. Lowest risk.
2. Remove the plugin entirely. Slightly cleaner, but breaks any Manus-hosted preview that depends on the runtime.

Not actioned. It touches `vite.config.ts` and needs a decision.

### 10.4 Confirmed defect: a resident who registers without a Valid ID can never sign in

> **Status: DECIDED and built 2026-10-05.** Option A was taken, with option B left open
> as the client's call. Measured outcome, verification and two new residual risks in
> 11.3. The analysis below is preserved exactly as written on 2026-10-04.

This is the most serious finding in this section. It was inferred earlier as OQ 12 and is now verified in a browser against live staging.

**The chain, each link verified:**

| Step | Location | Behaviour |
|---|---|---|
| 1. Resident registers, no ID attached | `routers.ts:668` `validId` is `nullish` | Account is created successfully. The API returns `approvalRequired: true`, `idDocumentId: null`. |
| 2. Account status | `registerLocalUser` | Created as **PENDING**, whether or not an ID was attached. |
| 3. Sign-in is refused | `routers.ts:884` | `login` throws FORBIDDEN: "Your account is waiting for Administrator approval." |
| 4. No queue lists it | `routers.ts:441-453` | `idVerification.queue` calls `listIdDocumentsForReview`. It lists **ID documents**, not accounts. An ID-less registration produces no document row, so it appears in no queue. |
| 5. No route to approval | `routers.ts:1685` | The approve and decline mutation takes a `userId`, but no screen offers a list of PENDING **accounts** to choose from. |
| 6. No notification | - | `RESEND_API_KEY` is unset, so no email tells the resident anything happened. |

**Net effect: a permanent dead end.** The resident registers successfully, is told the account exists, and can then do nothing at all. They cannot sign in, cannot see safety advice, cannot find a centre, and cannot reach staff through the system. Staff cannot see them to approve them. No amount of waiting helps, because nothing is queued.

**This contradicts the code's own stated intent.** The comment at `routers.ts:662-667` says:

> A registration without one is approved on judgement, and flagged as having no ID on file.

That behaviour was never built. The comment describes the intended design; the code does the opposite. This matters beyond the bug itself, because the comment is what a future maintainer would trust.

**Evidence that this is already live, not theoretical:** the two accounts `test1234@gmail.com` and `test1235@gmail.com` are exactly this case. They have been stuck since before this session. They are visible in any client demonstration of the user list.

**UNREVIEWED - recommendation.** Two candidate fixes, and they are not mutually exclusive:

| Option | Change | Cost | Effect |
|---|---|---|---|
| A. Approve on registration when no ID is attached | Set `accountStatus: "APPROVED"` in `registerLocalUser` when `validId` is absent, matching the existing comment. Record that the account has no ID on file. | Under an hour | Resolves the dead end immediately, matches the documented intent, and removes the need for the queue in option B. |
| B. Add an accounts queue | New `idVerification.pendingAccounts` query listing PENDING accounts with no ID document, and an approve and decline control for each. | Roughly half a day | Keeps staff judgement in the loop for every registration, which is defensible for a disaster-response system where residency matters. |

**Our recommendation is A first, then B only if the client wants staff approval of every registration.** Reason: A costs under an hour and makes the system usable. B is the more cautious design but adds a permanent queue of accounts that staff must work through, and it depends on the same staff being available, which the schedule in 9.6 already treats as a risk.

Either way, this is a question for the client in one line: should a resident be able to use the app immediately after registering, or should an officer approve every account first? The answer changes the design, and it is not ours to assume.

### 10.5 Test data now present in staging and needing removal

Verification created accounts through the public registration form. They are PENDING, so they cannot sign in and cannot act, but they are visible in the user list.

| Email | Origin | Confirmed created |
|---|---|---|
| `test1234@gmail.com` | earlier session | yes |
| `test1235@gmail.com` | earlier session | yes |
| `likas.uicheck.mutkiw1j@gmail.com` | this session | inferred, not confirmed |
| `likas.uicheck.mutknma9@gmail.com` | this session | yes |
| `likas.uicheck.mutkr5bz@gmail.com` | this session | yes |
| `likas.uicheck.mutkzh3s@gmail.com` | this session | yes |
| `likas.uicheck.mutm165k@gmail.com` | this session | yes |

All are unreachable random addresses at gmail.com, so no message can be delivered to a real mailbox and no resident or staff account is involved. They should all be deleted before any client demonstration. Deletion requires in-container database access, which is currently blocked - see 10.6.

### 10.6 Blocker: in-container database access needs one click from the user

`railway ssh` requires an SSH public key linked to the Railway account, which the CLI cannot do itself. It returns a `human_signup_url` for a person to open.

This blocks three queued items, all of which need in-container database access:

1. Deleting the seven test accounts in 10.5.
2. Running migrations inside the container as part of the deploy gate (9.4.3). The database host is unreachable from outside, so `drizzle-kit migrate` cannot run locally.
3. Promoting one throwaway account to APPROVED so `verify-change-password.mjs` can finish verifying the change-password screen.

A throwaway ed25519 key was generated at `%LOCALAPPDATA%\Temp\opencode\likas_db_temp` for this purpose and is not yet linked. If the user declines, delete it and the verification of the change-password screen stays outstanding.

**Risk note.** Linking the key grants SSH access to the staging container. It should be removed from `authorized_keys` immediately afterwards, and the local private key deleted. The user should decide whether that trade is worth making, and it is not required for any other work.

## 11. Decision record - 2026-10-05

Two recommendations from 10.3 and 10.4 were approved by the user and built the same day. Both are recorded here with what was measured, not with what was expected.

### 11.1 Standing caveat on these records

Every number below was measured against a real build or a real browser, not inferred from reading code. That distinction matters because of a pattern established earlier in this project: four of seven session defects passed typecheck and passed the unit tests, and were caught only by clicking. The green suite lied three separate times. Where something was verified by measurement it says so; where it is still unverified it says that instead.

### 11.2 Inline runtime removed from production builds - 358 KB recovered

**Decision.** Keep `vitePluginManusRuntime()` in development so Manus-hosted previews keep working, and drop it from production builds. Option 2, removing it entirely, was rejected because it would break those previews for no additional resident benefit.

**What changed.** `vite.config.ts` now includes the plugin conditionally:

```
...(process.env.NODE_ENV === "production" ? [] : [vitePluginManusRuntime()]),
```

**This gate was verified rather than assumed.** `process.env.NODE_ENV` is not documented as reliably set when Vite evaluates its config file, and a gate that silently evaluates false would have been a no-op that looked like a success. So the built output was measured directly, twice, for both halves of the promise:

| Measurement | Dev server | Production build |
|---|---|---|
| `index.html` served | 359.7 KB | 0.9 KB, then 1.2 KB after the comment in 11.5 |
| `<script id="manus-runtime">` present | yes | no |
| Inline script blocks in the document | 1 | 0 |
| Hosted previews still work | yes | not applicable |

**Independent confirmation.** The production build was served locally with `vite preview` and put through the full headless browser suite: **9 of 9 checks passed**, including all five public routes, the signed-out redirect on `/account/security`, confirmation that no password form is exposed to unauthenticated visitors, and no horizontal overflow at 390 px. The app boots and routes correctly with the 358 KB block absent, which was the actual risk.

The only console errors during that run were six tRPC failures, because a static preview has no `/api/trpc` backend. Those are an artefact of the harness, not a defect, and none of them referenced the removed runtime.

**A false alarm was checked and cleared.** The app bundle still contains the string `manus-runtime`, at `localStorage.setItem("manus-runtime-user-info", ...)`. That is our own code writing a local storage key, unrelated to the removed script. Removing the runtime does not affect it.

### 11.3 Registration no longer dead-ends a resident without a Valid ID

**Decision.** Option A, approve on registration when no ID is attached. Option B, a staff-facing queue of PENDING accounts, is left open as the client's decision and is not built.

**What changed, in three places:**

| File | Change |
|---|---|
| `server/db.ts` | `registerLocalUser` takes a new `hasValidId: boolean` and writes `accountStatus: input.hasValidId ? "PENDING" : "APPROVED"`. Previously it hardcoded `PENDING` for every registration. |
| `server/routers.ts` | Passes `hasValidId: Boolean(input.validId)` and returns a truthful `approvalRequired` instead of the hardcoded `true`. The misleading comment at 662-667 now states the consequence of the flag, including how the old behaviour was a dead end. |
| `client/src/pages/AccountRegister.tsx` | Tracks `approvalRequired`, skips the pointless 500 ms poll when no approval is outstanding, and calls `completeApproval` immediately so the resident lands in the app instead of watching a waiting screen they are not in. |

**Resulting behaviour.** A citizen who registers with no ID is approved on judgement and is signed in on arrival. A citizen who attaches an ID stays PENDING, because there is a document for a reviewer to look at, and the existing review workflow is unchanged. The client is told which of the two cases occurred rather than being told `true` unconditionally.

**The db layer is tested directly, not only through the router.** The defect lived in `registerLocalUser`, so a router-only test would have missed the original bug entirely and could pass again against a regression. `server/register-local-user.test.ts` fakes the drizzle insert chain and asserts on the row that is actually written.

**Test results.** 21 files, 217 tests, all passing. Typecheck clean. That is 11 new tests across two new files, plus one existing test in `auth-security.test.ts` that was corrected because it encoded the old behaviour:

| File | Tests | Covers |
|---|---|---|
| `server/register-local-user.test.ts` | 5 | `APPROVED` with no ID, `PENDING` with an ID, never an undefined status, credential row always created, email normalisation |
| `server/registration-approval.test.ts` | 6 | truthful `approvalRequired` both ways, `hasValidId` passed through both ways, token issued either way, failed-upload case |
| `server/auth-security.test.ts` | amended | the old test asserted `approvalRequired: true` for an ID-less registration, which is the defect itself |

**Two constraints the tests surfaced, worth recording because they are real behaviour:**

1. **The Gmail-only rule is enforced in the zod schema, not just in the form.** `resident@example.com` is rejected by the server with "Use a Gmail address ending in @gmail.com." The client-side hint was never the only gate.
2. **Registration is rate limited to 5 per hour per email address**, keyed `register:${email}`. This is correct behaviour and it is why the new tests use a unique address per call rather than mocking the limiter away. Worth noting for the future: a resident who mistypes and retries, or retries on a flaky connection, can exhaust that budget and be locked out for an hour with no explanation and no email, since `RESEND_API_KEY` is unset.

### 11.4 Residual risks and limits of this change, stated plainly

**Not fixed: a failed ID upload still strands the account.** The account is created PENDING before the upload is attempted, so if storage fails the account stays PENDING with no document row, which is the same shape of dead end as 10.4. It is recoverable inside that browser session, because the waiting screen offers an "Upload my ID" retry, and a test asserts this case explicitly. A resident who closes the tab first has no way back in, because there is still no staff screen listing PENDING accounts. Fixing it properly means promoting the account to APPROVED after a failed upload, which also requires a route to attach an ID once signed in. That is more than the bug it fixes and it was not built under this decision.

**Still open: option B.** Whether a resident may use the app immediately after registering, or an officer must approve every account, remains the client's call and is not ours to assume. Option A is the default we shipped. Option B is additive and can be built later without undoing anything here.

**Not verified in a browser: the new registration path.** The code, the tests and the build are verified. The end-to-end resident journey - register without an ID, be signed straight in - has not been clicked through, because that needs a running backend and the database is unreachable from outside the container, see 10.6. This is the single most important remaining verification and it is the reason the deploy gate in 9.4.3 matters.

### 11.5 Incidental finding: the credential-capture script is not reachable in production

`vitePluginManusDebugCollector()` is the root cause of the `.manus-logs` directory that captured an admin password earlier in this project. It is still emitted into the production build, as `dist/public/__manus__/debug-collector.js`, 24.6 KB.

It is **not loaded**. The built `index.html` contains no reference to it. Its injection and middleware only run under the Vite dev server, so the credential capture was a development-only exposure and staging was never exposed to it. The file is inert dead weight in the build output rather than a live risk. Recorded so that nobody later re-enables it in production, and so the 24.6 KB is not mistaken for an active vulnerability.

### 11.6 Incidental fix: a misleading dev warning about analytics

The explanatory comment added to `client/index.html` when the 502 defect was fixed spelled out the placeholder token literally. Vite scans that file for `%VITE_*%` tokens and warned that the variable was undefined, which read as though a broken analytics tag were still present and would send the next person looking for a tag that no longer exists. The comment now names the variable without the percent delimiters. Verified: the rebuilt `index.html` contains no `%VITE_` token.

### 11.7 Bundle size, still open and still unscheduled

Unchanged by this work, recorded again so it is not lost:

| Asset | Uncompressed |
|---|---|
| `index.html` | 1.2 KB, was 359.5 KB |
| Application JS | 1,241.9 KB |
| CSS | 196.2 KB |

The build still emits a chunk-size warning. This has not been scheduled. The 1.24 MB entry bundle is a real cost on the low-end phone on congested data that the client named as the target environment, and it is now by some distance the largest remaining performance item. It is not on the critical path to November and was not treated as one.

### 11.8 Defect introduced and fixed in the same change: a hot retry loop on session failure

Recording this because it is exactly the class of defect that a green suite does not catch.

The new immediate-completion branch in `AccountRegister.tsx` fired `completeApproval` from an effect whose guard included `!approvalAccepted`. The mutation's `onError` handler sets `approvalAccepted` back to `false`. So a resident whose session could not be issued would clear the guard and be fired at again immediately, with no polling to space the attempts out, looping against our own API as fast as the network allows.

The type checker was happy. All 217 tests passed. The browser suite passed 9 of 9. It was caught only by reading the effect and its error handler together, which is the review step that found the 502 and the false-passing registration assertion earlier in this project.

The fix is a `completionAttempted` ref that latches on the first attempt, checked by both the new branch and the pre-existing polling branch, and cleared only when the resident switches role and starts a genuinely new registration. The resident now sees one clear error and can reload to retry deliberately. A failing session issue is a single visible failure, not a flood of requests.

The pre-existing polling branch had the same latent hazard and is now guarded too, so this fixed a second path rather than only adding a new one.

### 11.9 The 358 KB removal shipped broken, and the verification that let it through

The first deploy of section 11.2 reported SUCCESS and did not work. This is recorded in full because the failure was in the verification, not in the diagnosis.

**What the smoke gate caught.** The gate reported 5 of 9 checks passing. The served `index.html` was 359.8 KB with the inline runtime still in it, and the entry bundle was 1619.2 KB, which is roughly 377 KB larger than the local build. The plugin adds the runtime to the bundle as well as the HTML, so both numbers pointed the same way.

**Root cause.** The gate in `vite.config.ts` was:

```
...(process.env.NODE_ENV === "production" ? [] : [vitePluginManusRuntime()]),
```

`process.env.NODE_ENV` is not reliably set at the moment Vite evaluates its config file. On the machine where this was written and measured it was set to production, so the runtime was correctly dropped. On the Railway build host it was not set, so the plugin was included and the 358 KB shipped anyway.

Confirmed rather than assumed: rebuilding locally with `NODE_ENV=development` reproduced the live HTML at 359.8 KB, matching the deployment. The fix replaces the environment read with Vite's own `command` parameter, which is `build` for `vite build` and `serve` for `vite dev`, and is a value Vite passes in rather than one the host has to remember to set. Re-verified with `NODE_ENV=development` still set: 1.3 KB, runtime absent. Development still serves 360 KB with the runtime, so hosted previews are unaffected.

**The lesson, which is the same one as 11.8.** The check was run in exactly one environment, and it passed there. Nothing about running it locally could have told us it would fail on the build host. A verification that only ever runs on the author's machine is an assertion, not a verification. The test that would have caught it is trivial to write and was simply not written: build with `NODE_ENV=development` and assert the runtime is absent. Where a build behaviour can be environment-sensitive, it needs a test that makes the environment hostile on purpose.

This is the fifth defect in this project that typecheck and the unit tests both passed, and the second this session that only measurement caught.

### 11.10 The deploy gate from 9.4.3 is now built

`scripts/smoke-staging.mjs`, nine checks against the live origin, and `scripts/deploy-staging.ps1`, which refuses to report a deploy as successful unless the smoke gate passes and prints a migration warning instead of implying the deploy is complete.

**The gate had two bugs of its own on its first run, both fixed.** It called the router name rather than the full dotted procedure path, so `localAuth.login` was requested as `localAuth` and returned "No procedure found on path localAuth". And it did not unwrap superjson's `.json` envelope, so a healthy `advice.list` returning `{"json":[]}` was reported as a failure. Both were my errors, caught by hand-testing the live API before believing the gate. A gate that produces false failures gets ignored, which is worse than having none, so the correct tRPC request and response shapes are now documented at the call site.

**The checks that carry the weight, and what each one catches:**

| Check | What a failure means |
|---|---|
| No inline `manus-runtime` in the served HTML | The deployed bundle predates 11.2. This is the stale-deploy detector. |
| `advice.list` answers | The container predates Wave 3. |
| `login` gives 401 naming the failure, not 500 | Schema drift between client and server. |
| `idVerification.queue` refuses anonymous | The session guard is gone. A security finding, not a stale deploy. |
| Upload route refuses a forged signature | A regression in the signed-URL guard. |

The login check randomises the address on every run, because registration and login are rate limited per email and a fixed address would eventually lock the gate itself out.

### 11.11 Two housekeeping items found while deploying

**`railway.toml` is deprecated.** Railway warns that Config as Code is deprecated and that existing files keep working only until **2026-12-01**. That is inside the delivery window this project is working against. Migrating is `railway config migrate`, which should be done before the deadline rather than discovered during it.

**`.env.bak` sits in the working tree.** It is 400 bytes, dated 2026-09-15, and holds a `DATABASE_URL` and a `JWT_SECRET`. It is not tracked by git and is ignored by the `*.bak` rule, so it has never reached the public repository and was not uploaded by this deploy. Its `DATABASE_URL` points at `127.0.0.1` as `root`, so it is a local development credential rather than the production one. The `JWT_SECRET` in it predates the rotation and should be assumed superseded. It has no remaining use and is recommended for deletion, which is the user's call rather than ours.

### 11.12 Known flake: the test suite fails under CPU contention

Running `vitest run` while a Vite dev server or preview server is running causes four files to fail collection with "Hook timed out in 10000ms", and 33 tests to be skipped. This is not a code defect and the suite passes 217 of 217 with nothing else running. It was reproduced twice, deliberately, by running the suite alongside a dev server.

It is recorded because a suite that fails intermittently under load trains people to ignore it, which is how the green-suite problem in 11.8 started. The honest fix is a `hookTimeout` above the default in `vitest.config.ts`, or capping concurrency so collection is not competing with itself. Not done here, because it is a tooling change that should be made deliberately rather than as a side effect of a deploy.