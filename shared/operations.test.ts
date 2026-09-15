import { describe, expect, it } from "vitest";
import {
  calculateCenterMetrics,
  citizenReportTypeFromDanger,
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

  it("classifies resource stock and expiry deterministically", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(getResourceStatus(20, 10, null, now)).toBe("AVAILABLE");
    expect(getResourceStatus(10, 10, null, now)).toBe("LOW_STOCK");
    expect(getResourceStatus(0, 10, null, now)).toBe("OUT_OF_STOCK");
    expect(getResourceStatus(20, 10, new Date("2026-08-22T00:00:00Z"), now)).toBe("EXPIRED");
  });
});
