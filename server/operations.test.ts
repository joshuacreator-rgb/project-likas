import { describe, expect, it } from "vitest";
import { calculateCenterMetrics, canTransitionReport, getResourceStatus, resolveNotificationDelivery } from "../shared/operations";

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
    expect(canTransitionReport("PENDING", "RESOLVED")).toBe(false);
    expect(canTransitionReport("RESOLVED", "PENDING")).toBe(false);
  });

  it("falls back to in-app delivery when providers are not configured", () => {
    expect(resolveNotificationDelivery({})).toEqual({ channels: ["IN_APP"], fallback: true });
    expect(resolveNotificationDelivery({ emailConfigured: true, smsConfigured: true })).toEqual({ channels: ["EMAIL", "SMS"], fallback: false });
  });
});
