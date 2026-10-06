import { describe, expect, it } from "vitest";
import { accessDenialReason, canAccessReport } from "./report-access";

/**
 * The single access rule for a report and its attachments, asserted directly.
 *
 * Center staff are the interesting case and the one most likely to be
 * "corrected" by someone who has not read US-7: they can list every report in
 * the system through `listRiskReportsForUser`, so the temptation is to assume
 * they can see what is attached to those reports. They cannot, by agreement
 * (section 12.3), and if that changes this file is where it changes.
 */

const admin = { id: 1, role: "admin" as const };
const staff = { id: 2, role: "staff" as const };
const responder = { id: 3, role: "responder" as const };
const otherResponder = { id: 4, role: "responder" as const };
const reporter = { id: 5, role: "citizen" as const };
const stranger = { id: 6, role: "citizen" as const };

const assignedToResponder = { reporterId: reporter.id, assignedResponderId: responder.id };

describe("canAccessReport", () => {
  it("admits the administrator unconditionally", () => {
    expect(canAccessReport(admin, { reporterId: null, assignedResponderId: null })).toBe(true);
    expect(canAccessReport(admin, assignedToResponder)).toBe(true);
  });

  it("admits the citizen who filed the report", () => {
    expect(canAccessReport(reporter, assignedToResponder)).toBe(true);
  });

  it("admits the responder the report is assigned to", () => {
    expect(canAccessReport(responder, assignedToResponder)).toBe(true);
  });

  it("refuses a responder the report is not assigned to", () => {
    // US-7 acceptance criterion 3: another responder's incident shows no
    // attachments, matching the rule that responders see their own cases.
    expect(canAccessReport(otherResponder, assignedToResponder)).toBe(false);
  });

  it("refuses centre staff even though they can list every report", () => {
    // The consequence is deliberate and documented on the function: a staff
    // member opening this report sees the incident with nothing beneath it.
    expect(canAccessReport(staff, assignedToResponder)).toBe(false);
  });

  it("refuses an unrelated citizen", () => {
    expect(canAccessReport(stranger, assignedToResponder)).toBe(false);
  });

  it("refuses everyone but the admin when nothing is assigned", () => {
    const unassigned = { reporterId: reporter.id, assignedResponderId: null };
    expect(canAccessReport(admin, unassigned)).toBe(true);
    expect(canAccessReport(reporter, unassigned)).toBe(true);
    expect(canAccessReport(responder, unassigned)).toBe(false);
  });

  it("does not admit anyone on a null reference", () => {
    // Both columns are nullable. Treating null as a match would open every
    // unassigned report in the system to every user, which is the failure this
    // shape of check invites.
    const empty = { reporterId: null, assignedResponderId: null };
    expect(canAccessReport(staff, empty)).toBe(false);
    expect(canAccessReport(responder, empty)).toBe(false);
    expect(canAccessReport(stranger, empty)).toBe(false);
  });

  it("does not let a different id match through loose equality", () => {
    const wrongId = { reporterId: 50, assignedResponderId: 51 };
    expect(canAccessReport(reporter, wrongId)).toBe(false);
  });
});

describe("accessDenialReason", () => {
  it("separates a staff refusal from a stranger's", () => {
    // Both come back as a flat denial at the router, so the log is the only
    // place the difference survives.
    expect(accessDenialReason(staff)).toBe("STAFF_EXCLUDED");
    expect(accessDenialReason(stranger)).toBe("NOT_A_PARTY");
    expect(accessDenialReason(otherResponder)).toBe("NOT_A_PARTY");
  });
});
