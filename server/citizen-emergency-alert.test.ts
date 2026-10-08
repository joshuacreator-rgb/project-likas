import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockedDb = vi.hoisted(() => ({
  createRiskReport: vi.fn(),
  getRiskReportById: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
  createAlert: vi.fn(),
  getAlertById: vi.fn(),
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
  });
});
