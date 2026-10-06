import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * US-5 and US-7 access rules end to end: what `openEvidence` resolves, what
 * `operations.listEvidence` returns, and that both write an audit row.
 *
 * The database is mocked because these tests are about the checks in front of
 * it. A test that needs a reachable database to assert "staff are refused" is
 * not testing that staff are refused — it is testing that a database was up.
 */

const mockedDb = vi.hoisted(() => ({
  getEvidenceById: vi.fn(),
  getRiskReportById: vi.fn(),
  listEvidenceForReport: vi.fn(),
  logActivity: vi.fn(),
  uploadEvidence: vi.fn(),
  recordEvidenceUploadFailure: vi.fn(),
}));
vi.mock("./db", () => mockedDb);

let openEvidence: typeof import("./file-access").openEvidence;
let appRouter: typeof import("./routers").appRouter;

const REPORT = { id: 9, reporterId: 5, assignedResponderId: 3 };

const FILE_ROW = {
  id: 41,
  reportId: 9,
  fileKey: "risk-reports/9/5-photo_ab12cd34.jpg",
  // The stale shape: unsigned, and 403 for every request. Asserted absent from
  // anything returned to a client.
  fileUrl: "/api/upload/risk-reports/9/5-photo_ab12cd34.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 204_800,
  createdAt: new Date("2026-10-06T08:00:00Z"),
  status: "STORED",
};

/**
 * A row written by `recordEvidenceUploadFailure` (US-7 AC 4): the attempt to
 * attach it is real, the file behind it is not. `status` is the only column a
 * reader may trust, which is what the tests below assert.
 */
const FAILED_ROW = {
  id: 77,
  reportId: 9,
  fileKey: "",
  fileUrl: "",
  fileName: "photo.jpg",
  mimeType: "",
  sizeBytes: 0,
  createdAt: new Date("2026-10-06T08:05:00Z"),
  status: "FAILED" as const,
};

function user(role: User["role"], id: number): User {
  const now = new Date();
  return {
    id,
    openId: `${role}-test`,
    email: `${role}@example.com`,
    name: role,
    loginMethod: "test",
    role,
    isDemo: false,
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as unknown as User;
}

function contextFor(role: User["role"], id: number): TrpcContext {
  return {
    user: user(role, id),
    req: { protocol: "https", headers: {} } as unknown as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as unknown as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** The most recent activity row written, parsed back out of its JSON string. */
function lastAudit(): { action: string; entityId: number; metadata: string } {
  const calls = mockedDb.logActivity.mock.calls;
  if (!calls.length) throw new Error("expected an audit row to have been written");
  return calls[calls.length - 1][0];
}

beforeAll(async () => {
  ({ openEvidence } = await import("./file-access"));
  ({ appRouter } = await import("./routers"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.getEvidenceById.mockResolvedValue(FILE_ROW);
  mockedDb.getRiskReportById.mockResolvedValue(REPORT);
  mockedDb.listEvidenceForReport.mockResolvedValue([FILE_ROW]);
  mockedDb.logActivity.mockResolvedValue(undefined);
  mockedDb.uploadEvidence.mockResolvedValue({
    id: 41,
    url: "/api/files/evidence/41",
    mimeType: "image/jpeg",
  });
  mockedDb.recordEvidenceUploadFailure.mockResolvedValue({ id: 77, status: "FAILED" });
});

describe("openEvidence", () => {
  it("returns a storage key for the administrator", async () => {
    const result = await openEvidence(user("admin", 1), 41);
    expect(result).toMatchObject({ ok: true, fileKey: FILE_ROW.fileKey, mimeType: "image/jpeg" });
  });

  it("returns a storage key for the citizen who filed the report", async () => {
    const result = await openEvidence(user("citizen", 5), 41);
    expect(result.ok).toBe(true);
  });

  it("returns a storage key for the assigned responder", async () => {
    const result = await openEvidence(user("responder", 3), 41);
    expect(result.ok).toBe(true);
  });

  it("never returns the unsigned fileUrl column", async () => {
    // That path answers 403 for every request. Returning it would be handing a
    // client a link that cannot be fetched and calling it a working image.
    const result = await openEvidence(user("admin", 1), 41);
    expect(result).not.toHaveProperty("fileUrl");
    expect(JSON.stringify(result)).not.toContain("/api/upload/");
  });

  it("refuses centre staff and records why", async () => {
    const result = await openEvidence(user("staff", 2), 41);
    expect(result).toEqual({ ok: false, status: 404 });
    expect(mockedDb.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EVIDENCE_ACCESS_DENIED",
        entityType: "evidence_file",
        entityId: 41,
      }),
    );
    // The metadata is a JSON string, so it is parsed rather than matched: a
    // matcher inside JSON.stringify serialises to `{}` and asserts nothing.
    expect(JSON.parse(lastAudit().metadata).reason).toBe("STAFF_EXCLUDED");
    expect(JSON.parse(lastAudit().metadata).requesterRole).toBe("staff");
  });

  it("refuses a responder the report is not assigned to", async () => {
    const result = await openEvidence(user("responder", 4), 41);
    expect(result).toEqual({ ok: false, status: 404 });
    expect(JSON.parse(lastAudit().metadata).reason).toBe("NOT_A_PARTY");
  });

  it("refuses an unrelated citizen", async () => {
    const result = await openEvidence(user("citizen", 6), 41);
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("answers 404 rather than 403 for a file that does not exist", async () => {
    // Evidence ids are sequential: 403 on some and 404 on others would confirm
    // to an authenticated prober which ids exist and whose they are.
    mockedDb.getEvidenceById.mockResolvedValue(undefined);
    expect(await openEvidence(user("admin", 1), 9_999)).toEqual({ ok: false, status: 404 });
    expect(mockedDb.logActivity).not.toHaveBeenCalled();
  });

  it("refuses a FAILED row exactly as it refuses a missing file", async () => {
    // US-7 AC 4 wrote the row so the responder's list can show it; the route
    // must not serve it. There is no file behind it, and answering 404 rather
    // than something distinguishable keeps the "does it exist" oracle closed.
    mockedDb.getEvidenceById.mockResolvedValue(FAILED_ROW);
    expect(await openEvidence(user("admin", 1), 77)).toEqual({ ok: false, status: 404 });
    expect(mockedDb.logActivity).not.toHaveBeenCalled();
  });

  it("answers 404 when the report row has gone", async () => {
    mockedDb.getRiskReportById.mockResolvedValue(undefined);
    expect(await openEvidence(user("admin", 1), 41)).toEqual({ ok: false, status: 404 });
  });

  it("writes the audit row before returning the file", async () => {
    // Ordering is the whole point of an audit trail written by a streaming
    // route: a row written after the response is skipped when the transfer
    // drops, which is exactly when it would be needed.
    const order: string[] = [];
    mockedDb.logActivity.mockImplementation(async () => {
      order.push("audited");
      return undefined;
    });
    await openEvidence(user("admin", 1), 41);
    expect(order).toEqual(["audited"]);
  });

  it("records what was opened, not just that something was", async () => {
    await openEvidence(user("responder", 3), 41);
    expect(mockedDb.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EVIDENCE_VIEWED",
        entityType: "evidence_file",
        entityId: 41,
      }),
    );
    expect(JSON.parse(lastAudit().metadata)).toMatchObject({
      reportId: 9,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    });
  });
});

describe("operations.listEvidence", () => {
  it("refuses an anonymous caller", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.operations.listEvidence({ reportId: 9 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses centre staff and records the refusal", async () => {
    const caller = appRouter.createCaller(contextFor("staff", 2));
    await expect(caller.operations.listEvidence({ reportId: 9 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockedDb.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EVIDENCE_ACCESS_DENIED",
        entityType: "risk_report",
        entityId: 9,
      }),
    );
  });

  it("refuses a responder the report is not assigned to", async () => {
    const caller = appRouter.createCaller(contextFor("responder", 4));
    await expect(caller.operations.listEvidence({ reportId: 9 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a report that does not exist", async () => {
    mockedDb.getRiskReportById.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(contextFor("admin", 1));
    await expect(caller.operations.listEvidence({ reportId: 9 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns the authenticated serving route, not the unsigned column", async () => {
    const caller = appRouter.createCaller(contextFor("admin", 1));
    const rows = await caller.operations.listEvidence({ reportId: 9 });
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe("/api/files/evidence/41");
    expect(rows[0]).not.toHaveProperty("fileUrl");
    expect(JSON.stringify(rows)).not.toContain("/api/upload/");
  });

  it("keeps enough metadata for a gallery without leaking storage internals", async () => {
    const caller = appRouter.createCaller(contextFor("citizen", 5));
    const [row] = await caller.operations.listEvidence({ reportId: 9 });
    expect(row).toMatchObject({
      id: 41,
      reportId: 9,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 204_800,
    });
    expect(row).not.toHaveProperty("fileKey");
  });

  it("returns an empty list when the report has no attachments", async () => {
    mockedDb.listEvidenceForReport.mockResolvedValue([]);
    const caller = appRouter.createCaller(contextFor("responder", 3));
    await expect(caller.operations.listEvidence({ reportId: 9 })).resolves.toEqual([]);
  });

  it("marks FAILED rows as failed and gives them no serving url", async () => {
    // US-7 AC 4: the responder sees the file that never arrived, marked as
    // such, instead of concluding no photo was taken. The FAILED row has no
    // url because there is nothing to serve, and the client renders that.
    mockedDb.listEvidenceForReport.mockResolvedValue([FILE_ROW, FAILED_ROW]);
    const caller = appRouter.createCaller(contextFor("admin", 1));
    const rows = await caller.operations.listEvidence({ reportId: 9 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: "STORED", url: "/api/files/evidence/41" });
    expect(rows[1]).toMatchObject({ status: "FAILED", url: null });
  });

  it("records a failed upload and rethrows the original error", async () => {
    // The resident's upload threw after validation — US-5 AC 6. What matters
    // here is that the failure becomes visible to the responder (AC 4) and
    // that the caller still sees the real error, not a masked one.
    mockedDb.uploadEvidence.mockRejectedValue(new Error("That file is not a supported photo, screenshot or PDF"));
    const caller = appRouter.createCaller(contextFor("citizen", 5));
    await expect(
      caller.operations.uploadEvidence({ reportId: 9, fileName: "evil.txt", dataBase64: "AAAA" }),
    ).rejects.toThrow("That file is not a supported photo, screenshot or PDF");
    expect(mockedDb.recordEvidenceUploadFailure).toHaveBeenCalledWith({
      reportId: 9,
      fileName: "evil.txt",
    });
    expect(mockedDb.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EVIDENCE_UPLOAD_FAILED",
        entityType: "risk_report",
        entityId: 9,
      }),
    );
  });

  it("passes a successful upload straight through", async () => {
    const caller = appRouter.createCaller(contextFor("citizen", 5));
    const result = await caller.operations.uploadEvidence({
      reportId: 9,
      fileName: "photo.jpg",
      dataBase64: "dGh1bWJuYWls",
    });
    expect(result).toMatchObject({ id: 41, url: "/api/files/evidence/41" });
    expect(mockedDb.recordEvidenceUploadFailure).not.toHaveBeenCalled();
  });
});
