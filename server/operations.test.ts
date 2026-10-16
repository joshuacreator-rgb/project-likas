import { describe, expect, it } from "vitest";
import { alertDeliveryRoles, alertsVisibleToRole, calculateCenterMetrics, canTransitionReport, describeAssignmentNotification, evacueeMatchesSearch, getResourceStatus, resolveNotificationDelivery } from "../shared/operations";

describe("Project Likas operational rules", () => {
  it("prevents registration at a full center and calculates its occupancy", () => {
    const result = calculateCenterMetrics(120, 120, "OPEN");
    expect(result.availableSlots).toBe(0);
    expect(result.occupancyRate).toBe(100);
    expect(result.canAcceptEvacuee).toBe(false);
    expect(result.nextStatus).toBe("FULL");
  });

  it("keeps non-operational centers closed even when capacity exists", () => {
    const result = calculateCenterMetrics(80, 20, "UNDER_MAINTENANCE");
    expect(result.availableSlots).toBe(60);
    expect(result.canAcceptEvacuee).toBe(false);
    expect(result.nextStatus).toBe("UNDER_MAINTENANCE");
  });

  it("classifies resource stock and expiry deterministically", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(getResourceStatus(20, 10, null, now)).toBe("AVAILABLE");
    expect(getResourceStatus(10, 10, null, now)).toBe("LOW_STOCK");
    expect(getResourceStatus(0, 10, null, now)).toBe("OUT_OF_STOCK");
    expect(getResourceStatus(20, 10, new Date("2026-08-22T00:00:00Z"), now)).toBe("EXPIRED");
  });

  it("enforces the responder report workflow", () => {
    expect(canTransitionReport("PENDING", "VERIFIED")).toBe(true);
    expect(canTransitionReport("VERIFIED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionReport("IN_PROGRESS", "RESOLVED")).toBe(true);
    // Client §26: Resolve works directly from any open state…
    expect(canTransitionReport("PENDING", "RESOLVED")).toBe(true);
    // …but nothing comes back out of a closed report.
    expect(canTransitionReport("RESOLVED", "PENDING")).toBe(false);
  });

  it("allows only the full valid transition map for incident statuses", () => {
    const statuses = ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;
    const expected: Record<(typeof statuses)[number], (typeof statuses)[number][]> = {
      PENDING: ["PENDING", "VERIFIED", "RESOLVED", "REJECTED"],
      VERIFIED: ["VERIFIED", "IN_PROGRESS", "RESOLVED", "REJECTED"],
      IN_PROGRESS: ["IN_PROGRESS", "RESOLVED", "REJECTED"],
      RESOLVED: ["RESOLVED"],
      REJECTED: ["REJECTED"],
    };
    for (const current of statuses) {
      for (const next of statuses) {
        expect(canTransitionReport(current, next)).toBe(expected[current].includes(next));
      }
    }
  });

  it("never lets a skipped or backwards status change through", () => {
    expect(canTransitionReport("PENDING", "IN_PROGRESS")).toBe(false);
    expect(canTransitionReport("IN_PROGRESS", "VERIFIED")).toBe(false);
    expect(canTransitionReport("VERIFIED", "PENDING")).toBe(false);
    expect(canTransitionReport("RESOLVED", "REJECTED")).toBe(false);
  });

  it("shows each role only its targeted alerts plus public broadcasts", () => {
    const alerts = [
      { id: 1, title: "Responder alert", message: "m", alertType: "T", priority: "HIGH", targetAudience: "RESPONDERS", isActive: true, createdAt: new Date() },
      { id: 2, title: "Staff alert", message: "m", alertType: "T", priority: "MEDIUM", targetAudience: "STAFF", isActive: true, createdAt: new Date() },
      { id: 3, title: "Public alert", message: "m", alertType: "T", priority: "LOW", targetAudience: "ALL_USERS", isActive: true, createdAt: new Date() },
      { id: 4, title: "Ended alert", message: "m", alertType: "T", priority: "CRITICAL", targetAudience: "RESPONDERS", isActive: false, createdAt: new Date() },
    ] as const;
    expect(alertsVisibleToRole(alerts, "responder").map(a => a.id)).toEqual([1, 3]);
    expect(alertsVisibleToRole(alerts, "staff").map(a => a.id)).toEqual([2, 3]);
    expect(alertsVisibleToRole(alerts, "admin").map(a => a.id)).toEqual([1, 2, 3]);
    expect(alertsVisibleToRole(undefined, "responder")).toEqual([]);
  });

  it("also shows staff the incident notifications (client §26)", () => {
    const alerts = [
      { id: 1, title: "Fire", message: "m", alertType: "CITIZEN_EMERGENCY", priority: "HIGH", targetAudience: "RESPONDERS", isActive: true, createdAt: new Date() },
      { id: 2, title: "Flood — assignment", message: "m", alertType: "INCIDENT_ASSIGNMENT", priority: "MEDIUM", targetAudience: "RESPONDERS", isActive: true, createdAt: new Date() },
      { id: 3, title: "Flood — rejected", message: "m", alertType: "INCIDENT_REJECTED", priority: "LOW", targetAudience: "ADMIN", isActive: true, createdAt: new Date() },
      { id: 4, title: "Advisory", message: "m", alertType: "GENERAL_UPDATE", priority: "LOW", targetAudience: "RESPONDERS", isActive: true, createdAt: new Date() },
    ] as const;
    // Staff receive the three incident notifications; the responder-only
    // general update stays responder-only.
    expect(alertsVisibleToRole(alerts, "staff").map(a => a.id)).toEqual([1, 2, 3]);
    expect(alertsVisibleToRole(alerts, "responder").map(a => a.id)).toEqual([1, 2, 4]);
  });

  it("delivers incident notifications to staff alongside the stamped audience (client §26)", () => {
    expect([...alertDeliveryRoles({ alertType: "CITIZEN_EMERGENCY", targetAudience: "RESPONDERS" })].sort()).toEqual(["responder", "staff"]);
    expect([...alertDeliveryRoles({ alertType: "INCIDENT_REJECTED", targetAudience: "ADMIN" })].sort()).toEqual(["admin", "staff"]);
    // A non-incident alert keeps its plain audience mapping.
    expect(alertDeliveryRoles({ alertType: "GENERAL_UPDATE", targetAudience: "STAFF" })).toEqual(["staff"]);
  });

  it("falls back to in-app delivery when providers are not configured", () => {
    expect(resolveNotificationDelivery({})).toEqual({ channels: ["IN_APP"], fallback: true });
    expect(resolveNotificationDelivery({ emailConfigured: true, smsConfigured: true })).toEqual({ channels: ["EMAIL", "SMS"], fallback: false });
  });
});

describe("Responder assignment notification (spec 4.1)", () => {
  const report = {
    id: 12,
    reportCode: "RPT-0012",
    description: "Flooding near the bridge",
    location: "J.P. Rizal St, Pateros",
    complainantName: "Maria Santos",
    reportedAt: new Date("2026-10-16T08:30:00+08:00"),
    status: "IN_PROGRESS",
    latitude: 14.5501,
    longitude: 121.0647,
  };

  it("carries the incident, complainant, status, assigned time and attachments", () => {
    const message = describeAssignmentNotification(report, { assignedAt: new Date("2026-10-16T09:00:00+08:00"), attachmentCount: 2 });

    expect(message).toContain("RPT-0012");
    expect(message).toContain("J.P. Rizal St, Pateros");
    expect(message).toContain("Flooding near the bridge");
    expect(message).toContain("Maria Santos");
    expect(message).toContain("Status: IN_PROGRESS");
    expect(message).toContain("Assigned");
    expect(message).toContain("2 attachments on file");
    expect(message).toContain("google.com/maps");
  });

  it("says so plainly when there are no attachments or coordinates", () => {
    const message = describeAssignmentNotification(
      { ...report, reportCode: null, complainantName: null, latitude: null, longitude: null, reportedAt: null },
      { assignedAt: new Date("2026-10-16T09:00:00+08:00"), attachmentCount: 0 }
    );

    expect(message).toContain("Incident 12");
    expect(message).toContain("Reporter: Unknown");
    expect(message).toContain("No attachments on file");
    expect(message).not.toContain("google.com/maps");
  });

  it("uses the singular for exactly one attachment", () => {
    const message = describeAssignmentNotification(report, { assignedAt: new Date("2026-10-16T09:00:00+08:00"), attachmentCount: 1 });
    expect(message).toContain("1 attachment on file");
  });
});

describe("Registry search (spec 5.30)", () => {
  const row = { id: 7, firstName: "Angela Marie", middleName: "Cruz", lastName: "Dela Cruz", userEmail: "angela@gmail.com", householdId: 41 };

  it("matches by name, account email, household id or member id", () => {
    expect(evacueeMatchesSearch(row, "angela")).toBe(true);
    expect(evacueeMatchesSearch(row, "dela cruz")).toBe(true);
    expect(evacueeMatchesSearch(row, "Cruz")).toBe(true);
    expect(evacueeMatchesSearch(row, "angela@gmail.com")).toBe(true);
    expect(evacueeMatchesSearch(row, "41")).toBe(true);
    expect(evacueeMatchesSearch(row, "7")).toBe(true);
  });

  it("rejects anything that does not appear in the row", () => {
    expect(evacueeMatchesSearch(row, "santos")).toBe(false);
  });

  it("treats a blank query as match-everything so search stays optional", () => {
    expect(evacueeMatchesSearch(row, "   ")).toBe(true);
  });

  it("matches rows that have no linked account", () => {
    expect(evacueeMatchesSearch({ id: 3, firstName: "Ben", middleName: null, lastName: "Santos", userEmail: null, householdId: null }, "ben")).toBe(true);
  });
});
