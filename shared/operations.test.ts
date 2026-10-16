import { describe, expect, it } from "vitest";
import {
  CLOSED_ASSIGNMENT_MESSAGES,
  calculateCenterMetrics,
  citizenReportTypeFromDanger,
  closedAssignmentMessage,
  getAlertHeadline,
  getResourceStatus,
  getRiskReportHeadline,
} from "./operations";

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

  it("uses the citizen danger description as the incident headline", () => {
    expect(citizenReportTypeFromDanger("flood")).toBe("flood");
    expect(citizenReportTypeFromDanger("  Water rising\nnear the door  ")).toBe("Water rising");
    expect(
      getRiskReportHeadline({
        reportCode: "CIT-1",
        reportType: "Citizen emergency",
        description: "Fire in the kitchen",
      })
    ).toBe("Fire in the kitchen");
    expect(
      getRiskReportHeadline({
        reportCode: "CIT-2",
        reportType: "Flooding",
        description: "Longer notes stay in description",
      })
    ).toBe("Flooding");
  });

  it("titles an alert with the actual emergency name (client §26)", () => {
    // New alerts store the emergency name directly in the title.
    expect(
      getAlertHeadline({ title: "Fire in the kitchen", message: "anything" })
    ).toBe("Fire in the kitchen");
    // Legacy "… citizen emergency" titles derive the name from the message's
    // description segment: "<something> reported at <location>: <description>."
    expect(
      getAlertHeadline({
        title: "HIGH citizen emergency",
        message: "Citizen emergency reported at Mabini St, Pateros: Fire in the kitchen, second floor.",
      })
    ).toBe("Fire in the kitchen, second floor.");
    // A legacy title whose message has nothing to derive keeps itself.
    expect(
      getAlertHeadline({ title: "HIGH citizen emergency", message: "No location separator here" })
    ).toBe("HIGH citizen emergency");
    // Other alert types pass their title through untouched.
    expect(
      getAlertHeadline({ title: "Water interruption — Monday", message: "m" })
    ).toBe("Water interruption — Monday");
  });

  it("classifies resource stock and expiry deterministically", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(getResourceStatus(20, 10, null, now)).toBe("AVAILABLE");
    expect(getResourceStatus(10, 10, null, now)).toBe("LOW_STOCK");
    expect(getResourceStatus(0, 10, null, now)).toBe("OUT_OF_STOCK");
    expect(getResourceStatus(20, 10, new Date("2026-08-22T00:00:00Z"), now)).toBe("EXPIRED");
  });
});

describe("Client §30 closed-incident assignment refusal", () => {
  it("names the resolved and rejected refusals with the exact client sentence", () => {
    expect(closedAssignmentMessage("RESOLVED")).toBe(
      "This incident has been resolved. Responder assignment is no longer available."
    );
    expect(closedAssignmentMessage("REJECTED")).toBe(
      "This incident has been rejected. Responder assignment is no longer available."
    );
    // The map the server throws from is the same single source of truth.
    expect(CLOSED_ASSIGNMENT_MESSAGES.RESOLVED).toBe(
      closedAssignmentMessage("RESOLVED")
    );
    expect(CLOSED_ASSIGNMENT_MESSAGES.REJECTED).toBe(
      closedAssignmentMessage("REJECTED")
    );
  });

  it("keeps every open status assignable", () => {
    for (const status of ["PENDING", "VERIFIED", "IN_PROGRESS"]) {
      expect(closedAssignmentMessage(status)).toBeNull();
    }
  });
});
