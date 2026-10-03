# Project Likas — Client Change Request Backlog

**Source**: Client request (Tagalog), reviewed against the codebase
**Date**: 2026-09-30
**Status**: Draft — awaiting client confirmation on blocking questions
**Prepared by**: BA review of `C:\Users\joshua-macailao\Documents\project-likas\project-likas`

---

## 1. Client request (as received)

1. "May ilan kulang pa sa Citizen na pwede sila mag upload ng video or picture pangyayari" — Citizens should be able to upload video or photo of what is happening.
2. "Mag add mga advice at Video sana tungkol sa earthquake, Storm at Fire, kung ano paghahanda dapat nila gawin" — Add advice and videos for earthquake, storm, and fire, covering what preparations they should make.
3. "Tapus register, I hope meron nakalagay ng complete Name, Address, Age, Cp number" — At registration, collect complete Name, Address, Age, and CP number.
4. "Mag uupload sila ng Valid ID at ito dapat yung nirereview ni Admin kung taga Pateros sya bago mag karoon ng account" — Citizens upload a Valid ID; an Administrator reviews it to confirm they are from Pateros before they get an account.

---

## 2. Code review findings

What the client assumes vs. what actually exists in the codebase.

| # | Client assumes | Reality in code |
|---|---|---|
| 1 | Photo/video upload does not exist | Backend **does** exist: `operations.uploadEvidence` (images + PDF only, 10 MB cap, S3). The UI is **broken** — `client/src/pages/Home.tsx:1531` captures a filename and never calls the mutation. Nothing has ever been uploaded from the UI. The citizen page has no file input at all. **Video is rejected by the server today.** |
| 2 | Advice/videos are new | Correct, nothing exists. Bilingual precedent exists (`alerts.titleFilipino`, `alerts.messageFilipino`). |
| 3 | Registration is missing fields | Correct. `client/src/pages/AccountRegister.tsx` collects only role, name, email, password. `users` table has a `phone` column but **no `address`, `age`, or `barangay` column**. |
| 4 | Admin review of Valid ID is needed | The approval loop **already works** — `admin.updateUserApproval`, Approve/Decline buttons at `Home.tsx:2243`, citizen polls `localAuth.checkApproval` every 500 ms. This request **adds a step**, it does not require building the loop. |

### 2.1 Schema changes required

- `users`: add `address`, `age`. Reuse existing `phone` for CP number.
- New table for citizen ID documents (US-2).
- New table for safety advice (US-8).

### 2.2 Pre-existing issues found during review

| Issue | Location | Impact on this backlog |
|---|---|---|
| Evidence upload UI never calls the mutation | `client/src/pages/Home.tsx:1531` | Part of the client's item 1 is a bug fix, not new work |
| `database/project-likas.sql` is stale — missing `weather_snapshots` and `role_change_requests` | `database/project-likas.sql` | If treated as the schema reference, will mislead whoever implements these stories |
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

**Notes**
- **Do not reuse `operations.uploadEvidence` as-is.** It is scoped to `risk_reports`, allows any authenticated user, and returns a publicly proxyable `/manus-storage/{key}` URL
- **Requires new table**, e.g. `citizen_id_documents` (userId, fileKey, idType, idNumberMasked, status, reviewedBy, reviewedAt, rejectionReason)
- **Builds on**: `storagePut` in `server/storage.ts` (S3 via Forge presign)
- **Open Questions 1, 2, 3, 4 drive the design of this story**

---

#### US-3: Administrator reviews the Valid ID and verifies Pateros residency

**Story**
As an Administrator,
I want to view an applicant's Valid ID and their declared address side by side,
so that I only approve residents of Pateros and reject everyone else.

**Type**: Change to existing
**Priority**: Must

**Acceptance Criteria**

1. Review queue
   - Given citizen accounts are waiting for approval
   - When I open User & roles
   - Then each pending applicant shows their Valid ID thumbnail, complete name, declared address, age, and mobile number

2. Approving a verified resident
   - Given the applicant's ID address matches a Pateros address
   - When I click Approve
   - Then the account becomes APPROVED, the applicant is signed in automatically, and the review is recorded in the Activity log

3. Rejecting a non-resident
   - Given the applicant's ID address is outside Pateros
   - When I click Decline and select a reason
   - Then the account becomes REJECTED, the reason is shown to the applicant, and the review is recorded in the Activity log

4. Insufficient evidence
   - Given the Valid ID is unreadable, cropped, or expired
   - When I click Decline with reason "Unclear or expired ID"
   - Then the applicant sees that reason and may submit a new ID

5. Access control
   - Given I am signed in as Evacuation Center Staff, Responder, or Citizen
   - When I attempt to open the Valid ID review view or the stored file
   - Then access is denied and no file is returned

6. Audit
   - Given any Administrator or staff member opens a stored Valid ID
   - When the file is opened
   - Then an Activity log entry records who viewed which applicant's ID and when

**Notes**
- **Builds on**: existing `admin.updateUserApproval` (Approve/Decline at `Home.tsx:2243`) and the `activity_logs` table
- **Business rules**: `updateUserApproval` already rejects non-citizen targets — reuse that guard
- **Security requirement**: IDs must be served through an authenticated, authorization-checked route — **not** the public `/manus-storage/{key}` proxy
- **Out of scope**: bulk approval, auto-OCR of the ID number (see US-4)

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
- **Why proposed**: the client asked for rejection, but not for recovery. Without it, a blurry photo means a permanently dead account. Highest-value addition in this epic — confirm with the client before building

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

### Epic: Safety Advice and Preparation Videos

**Goal**: Give citizens clear, actionable preparedness guidance before a disaster.
**Actors**: Administrator, Citizen

---

#### US-8: Administrator publishes safety advice with a video

**Story**
As an Administrator,
I want to publish preparedness advice and a video for each hazard — earthquake, storm, and fire,
so that citizens know exactly what to do before and during a disaster.

**Type**: New
**Priority**: Must

**Acceptance Criteria**

1. Create advice
   - Given I am an Administrator
   - When I create advice for a hazard with an English title, Filipino title, English body, Filipino body, and an optional video
   - Then the advice is saved and immediately visible to citizens

2. Hazards covered
   - Given I create advice
   - When I select a hazard
   - Then I can choose from Earthquake, Storm, or Fire

3. Video upload
   - Given I attach a video to an advice item
   - When I save
   - Then it uploads and plays in the browser for citizens

4. Video is optional
   - Given I create an advice item with text only
   - When I save
   - Then it is published and shown to citizens without a video

5. Bilingual content
   - Given I create an advice item
   - When I leave the Filipino fields blank
   - Then citizens viewing the app in Filipino see the English text instead of an empty section

6. Editing and unpublishing
   - Given an advice item is live
   - When I edit it or unpublish it
   - Then the change takes effect for citizens, and unpublishing removes it from their view without deleting it

7. Access control
   - Given I am signed in as Citizen, Staff, or Responder
   - When I attempt to open the advice management view
   - Then access is denied

**Notes**
- **Builds on**: `alerts` bilingual precedent (`titleFilipino`, `messageFilipino`) — follow the same fallback pattern
- **Requires new table**, e.g. `safety_advice` (hazard, title, titleFilipino, body, bodyFilipino, videoKey, videoUrl, isPublished, sortOrder, updatedBy)
- **Business rules**: follow the existing `alerts.isActive` toggle pattern rather than deleting content
- **Open Question 6** — who writes and signs off on the Filipino and English text? This is content work, not development, and it gates release

---

#### US-9: Citizen views safety advice and preparation videos

**Story**
As a citizen,
I want to read simple preparation advice and watch a short video for earthquake, storm, and fire,
so that I know what to do before a disaster happens.

**Type**: New
**Priority**: Must

**Acceptance Criteria**

1. Advice is reachable without signing in
   - Given I am on the citizen home page and not signed in
   - When I look for preparation advice
   - Then I can read it without creating an account

2. All three hazards
   - Given I open the advice section
   - When I browse
   - Then I can switch between Earthquake, Storm, and Fire

3. Video playback
   - Given an advice item has a video
   - When I tap play
   - Then the video plays in the browser with captions available

4. Language toggle
   - Given I have switched the app to Filipino
   - When I open the advice
   - Then I see the Filipino title and body, and the Filipino video if one was provided, otherwise the English video

5. Accessibility
   - Given I use the "Read this page" text-to-speech control
   - When I am on the advice section
   - Then the advice text is read aloud in my selected language

6. Large text mode
   - Given I have turned on larger text
   - When I read the advice
   - Then the text and video remain fully usable and nothing is cut off

7. Offline
   - Given I have no internet connection
   - When I open previously viewed advice
   - Then I see a clear "no connection" message and the advice I already opened remains readable

8. Empty state
   - Given an Administrator has not published advice for a hazard yet
   - When I open that hazard
   - Then I see a clear message that guidance is not available yet, not a blank screen

**Notes**
- **Builds on**: `client/src/pages/CitizenHome.tsx`, `citizenCopy` in `shared/citizen.ts` (add new `en`/`fil` keys for all new copy), the existing `speakText` TTS helper, `largeText` state, and the offline cache pattern in `likas-cached-centers`
- **Business rules**: mirror the existing `getRiskReportHeadline` / `citizenCopy` fallback convention — never show an empty Filipino block
- **Out of scope**: personalizing advice by household profile, quizzes, certification

---

## 5. Open Questions

### Blocking — cannot build without an answer

| # | Question | Affects |
|---|---|---|
| 1 | How is "taga Pateros" proven? By the address on the Valid ID? By a declared barangay? Is a Pateros address on the ID enough, or must it be a specific ID type? | US-1, US-2, US-3 |
| 2 | Which IDs are accepted? PhilSys ID, Barangay ID, driver's license, utility bill, passport? | US-2, US-3 |
| 3 | How long are Valid IDs stored, especially for rejected applicants? Data privacy law requires a stated retention period. Keeping a rejected applicant's government ID indefinitely is a real legal exposure. | US-2, US-3 |
| 4 | Is the existing Gmail-only registration rule still correct? A senior citizen registering for evacuation support may not have a Gmail address. | US-1 |

### Needed before build

| # | Question | Affects |
|---|---|---|
| 5 | Are 60 seconds and 50 MB acceptable for citizen video? Will this be used on low-end phones with unstable mobile data? | US-6 |
| 6 | Who writes and approves the Filipino and English advice text and selects the videos? This is content work with a subject-matter expert, and it gates release. | US-8, US-9 |
| 7 | Should the Valid ID be visible to Evacuation Center Staff, or Administrators only? *(currently assumed Administrators only)* | US-3 |
| 8 | Should a citizen be able to attach media *after* submitting a report, not only during? | US-5, US-6 |
| 9 | Do these new fields need to appear in admin reports and exports? | US-1 |

### Flagged for the client, not blocking

| # | Note |
|---|---|
| 10 | Client item 1 is partly a **bug fix**, not a new feature. The photo upload control in the internal report form has never worked. Worth telling them so they know part of that work is smaller than expected. |
| 11 | `database/project-likas.sql` is stale and missing two tables. If the client treats it as the schema reference, it will mislead whoever implements these stories. |

---

## 6. Summary

| Story | Title | Type | Priority | Requested by client |
|---|---|---|---|---|
| US-1 | Register with complete personal details | Change | Must | Yes (item 3) |
| US-2 | Upload a Valid ID during registration | New | Must | Yes (item 4) |
| US-3 | Administrator reviews Valid ID and verifies Pateros residency | Change | Must | Yes (item 4) |
| US-4 | Applicant resubmits a rejected ID | Suggested | Could | No |
| US-5 | Citizen attaches a photo to an emergency report | Change | Must | Yes (item 1) |
| US-6 | Citizen attaches a short video to an emergency report | New | Must | Yes (item 1) |
| US-7 | Responder and Administrator view report attachments | Suggested | Should | No |
| US-8 | Administrator publishes safety advice with a video | New | Must | Yes (item 2) |
| US-9 | Citizen views safety advice and preparation videos | New | Must | Yes (item 2) |

**Total: 9 stories** (7 requested by the client, 2 marked Suggested).

US-4 and US-7 are analyst proposals, not client requests. Confirm with the client before they enter the backlog.

---

## 7. References

- Epic 1–3 map to the client's four requests in section 1
- Business rules reused from existing behaviour: transactional occupancy in `server/db.ts`, report status machine in `shared/operations.ts` (`canTransitionReport`), alert audience targeting in `shared/operations.ts` (`alertsVisibleToRole`), bilingual fallback in `shared/citizen.ts` (`citizenCopy`, `getRiskReportHeadline`)
- Existing citizen approval flow: `localAuth.register` → `localAuth.checkApproval` → `admin.updateUserApproval` (`server/routers.ts`)
