import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockedDb = vi.hoisted(() => ({
  createRiskReport: vi.fn(),
  getRiskReportById: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
  createAlert: vi.fn(),
  getAlertById: vi.fn(),
  updateRiskReport: vi.fn(),
  endAlertsForReport: vi.fn(),
  endAlert: vi.fn(),
}));
vi.mock("./db", () => mockedDb);

let appRouter: typeof import("./routers").appRouter;

function citizenContext() {
  const now = new Date();
  const user = {
    id: 9,
    openId: "citizen-alert-test",
    email: "citizen@example.com",
    name: "Citizen",
    loginMethod: "test",
    role: "citizen",
    isDemo: false,
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as unknown as User;
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

const reportInput = {
  reportCode: "CIT-1001",
  reportType: "Citizen emergency",
  description: "Water is entering our home on Mabini Street",
  location: "Mabini St, Pateros",
  latitude: 14.544,
  longitude: 121.071,
  priority: "HIGH" as const,
};

beforeAll(async () => {
  ({ appRouter } = await import("./routers"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("citizen emergency responder alert", () => {
  it("carries the resident's description so responders know what happened", async () => {
    mockedDb.createRiskReport.mockResolvedValue({ id: 42 });
    mockedDb.getRiskReportById.mockResolvedValue({
      id: 42,
      reportCode: reportInput.reportCode,
      reportType: reportInput.reportType,
      description: reportInput.description,
      location: reportInput.location,
      latitude: String(reportInput.latitude),
      longitude: String(reportInput.longitude),
      priority: reportInput.priority,
      status: "PENDING",
      createdAt: new Date(),
    });
    mockedDb.createAlert.mockResolvedValue({ id: 7 });
    mockedDb.getAlertById.mockResolvedValue(null);

    await appRouter
      .createCaller(citizenContext())
      .operations.createRiskReport(reportInput);

    expect(mockedDb.createAlert).toHaveBeenCalledTimes(1);
    const alert = mockedDb.createAlert.mock.calls[0][0];
    expect(alert.message).toContain(reportInput.description);
    expect(alert.message).toContain(reportInput.location);
    expect(alert.targetAudience).toBe("RESPONDERS");
    expect(alert.alertType).toBe("CITIZEN_EMERGENCY");
    // The alert is linked to the report so closing the report can end it.
    expect(alert.reportId).toBe(42);
  });
});

function reportRow(status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "REJECTED") {
  return {
    id: 42,
    reportCode: reportInput.reportCode,
    reportType: reportInput.reportType,
    description: reportInput.description,
    location: reportInput.location,
    latitude: String(reportInput.latitude),
    longitude: String(reportInput.longitude),
    priority: reportInput.priority,
    status,
    assignedResponderId: null,
    createdAt: new Date(),
  };
}

function adminContext() {
  const now = new Date();
  const user = {
    id: 1,
    openId: "admin-alert-test",
    email: "admin@example.com",
    name: "Admin",
    loginMethod: "test",
    role: "admin",
    isDemo: false,
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as unknown as User;
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("report closure ends its linked alert", () => {
  beforeEach(() => {
    mockedDb.updateRiskReport.mockResolvedValue({ reportId: 42 });
    mockedDb.endAlertsForReport.mockResolvedValue([]);
  });

  it("deactivates the linked alert when the incident is resolved", async () => {
    mockedDb.getRiskReportById.mockResolvedValue(reportRow("IN_PROGRESS"));
    await appRouter
      .createCaller(adminContext())
      .operations.updateRiskReport({ reportId: 42, status: "RESOLVED" });
    expect(mockedDb.endAlertsForReport).toHaveBeenCalledWith(42);
  });

  it("deactivates the linked alert when the incident is rejected", async () => {
    mockedDb.getRiskReportById.mockResolvedValue(reportRow("PENDING"));
    await appRouter
      .createCaller(adminContext())
      .operations.updateRiskReport({ reportId: 42, status: "REJECTED" });
    expect(mockedDb.endAlertsForReport).toHaveBeenCalledWith(42);
  });

  it("leaves alerts alone while the incident stays open", async () => {
    mockedDb.getRiskReportById.mockResolvedValue(reportRow("IN_PROGRESS"));
    await appRouter
      .createCaller(adminContext())
      .operations.updateRiskReport({ reportId: 42, status: "IN_PROGRESS" });
    expect(mockedDb.endAlertsForReport).not.toHaveBeenCalled();
  });
});

describe("admin endAlert", () => {
  beforeEach(() => {
    mockedDb.endAlert.mockResolvedValue({
      id: 5,
      title: "Flood warning",
      message: "Water level rising",
      alertType: "GENERAL_UPDATE",
      priority: "HIGH",
      targetAudience: "ALL_USERS",
      isActive: false,
      createdAt: new Date(),
    });
  });

  it("ends the alert and records the action", async () => {
    const result = await appRouter
      .createCaller(adminContext())
      .admin.endAlert({ alertId: 5 });
    expect(mockedDb.endAlert).toHaveBeenCalledWith(5);
    expect(result.isActive).toBe(false);
    expect(mockedDb.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "END", entityType: "alert", entityId: 5 })
    );
  });

  it("rejects ending an alert that does not exist", async () => {
    mockedDb.endAlert.mockResolvedValue(undefined);
    await expect(
      appRouter.createCaller(adminContext()).admin.endAlert({ alertId: 404 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
