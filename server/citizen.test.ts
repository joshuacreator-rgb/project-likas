import { describe, expect, it } from "vitest";
import { addOfflineReport, distanceKm, getDirectionsUrl, getSmsFallbackUrl, normalizeSmsConfiguration, parseOfflineReports, projectOfflineMapPoint, realtimeAudienceRoles, serializeOfflineReport, sortCentersForCitizens } from "../shared/citizen";

describe("citizen mobility and offline utilities", () => {
  it("calculates a positive distance between two center coordinates", () => {
    expect(distanceKm({ lat: 14.544, lng: 121.071 }, { lat: 14.546, lng: 121.074 })).toBeGreaterThan(0);
  });
  it("builds walking directions with an optional GPS origin", () => {
    const url = getDirectionsUrl({ lat: 14.546, lng: 121.074 }, { lat: 14.544, lng: 121.071 });
    expect(url).toContain("travelmode=walking");
    expect(url).toContain("origin=14.544%2C121.071");
  });
  it("serializes a report for reconnect retry and builds an SMS composer link", () => {
    const report = { reportText: "Flood water entering home", location: "Pateros", createdAt: 123 };
    expect(JSON.parse(serializeOfflineReport(report))).toEqual(report);
    expect(getSmsFallbackUrl("09171234567", "Emergency report")).toContain("sms:09171234567?body=");
  });
  it("keeps multiple offline reports in FIFO order and tolerates a legacy single report", () => {
    const first = { reportText: "Flood", location: "Barangay A", createdAt: 1 };
    const second = { reportText: "Fire", location: "Barangay B", createdAt: 2 };
    const queue = addOfflineReport(addOfflineReport(null, first), second);
    expect(parseOfflineReports(queue)).toEqual([first, second]);
    expect(parseOfflineReports(JSON.stringify(first))).toEqual([first]);
  });
  it("preserves an English fallback when a live Filipino field is missing", () => {
    const liveAlert = { title: "Flood watch", titleFilipino: null };
    expect(liveAlert.titleFilipino || liveAlert.title).toBe("Flood watch");
  });
  it("sorts open centers with free space first, then nearest, then by name", () => {
    const centers = [
      { name: "Full Hall", currentOccupancy: 120, maximumCapacity: 120, status: "OPEN", distance: 0.5 },
      { name: "Closed Hall", currentOccupancy: 0, maximumCapacity: 80, status: "CLOSED", distance: 0.1 },
      { name: "Far Room", currentOccupancy: 10, maximumCapacity: 50, status: "OPEN", distance: 3 },
      { name: "Near Room", currentOccupancy: 20, maximumCapacity: 60, status: "OPEN", distance: 1 },
    ];
    const ordered = sortCentersForCitizens(centers).map(center => center.name);
    expect(ordered).toEqual(["Near Room", "Far Room", "Full Hall", "Closed Hall"]);
  });
  it("falls back to name order when no distance is known and keeps the input unchanged", () => {
    const centers = [
      { name: "Zulu Center", currentOccupancy: 5, maximumCapacity: 100, status: "OPEN" },
      { name: "Alpha Center", currentOccupancy: 90, maximumCapacity: 100, status: "OPEN" },
      { name: "Mid Center", currentOccupancy: 30, maximumCapacity: 100, status: "CLOSED" },
    ];
    const ordered = sortCentersForCitizens(centers);
    expect(ordered.map(center => center.name)).toEqual(["Alpha Center", "Zulu Center", "Mid Center"]);
    expect(centers.map(center => center.name)).toEqual(["Zulu Center", "Alpha Center", "Mid Center"]);
  });
  it("projects cached center coordinates into a bounded offline map point", () => {
    const point = projectOfflineMapPoint({ lat: 14.545, lng: 121.07 });
    expect(point.left).toBeGreaterThan(4);
    expect(point.left).toBeLessThan(96);
    expect(point.top).toBeGreaterThan(6);
    expect(point.top).toBeLessThan(94);
  });
  it("normalizes the official SMS destination and provider setting", () => {
    expect(normalizeSmsConfiguration({ officialNumber: "+63 917-123-4567", provider: "TWILIO" })).toEqual({ officialNumber: "+639171234567", provider: "TWILIO" });
  });
  it("routes realtime alert audiences to exactly the target roles", () => {
    expect(realtimeAudienceRoles("RESPONDERS")).toEqual(["responder"]);
    expect(realtimeAudienceRoles("STAFF")).toEqual(["staff"]);
    expect(realtimeAudienceRoles("ADMIN")).toEqual(["admin"]);
    expect(realtimeAudienceRoles("CITIZENS")).toEqual(["citizen", "user"]);
    expect(realtimeAudienceRoles("ALL_USERS")).toEqual(["citizen", "user", "responder", "staff", "admin"]);
  });
});
