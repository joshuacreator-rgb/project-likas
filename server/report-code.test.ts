import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 3.2 pins the incident ID to the server: live clients no longer send a
 * report code, so createRiskReport generates one itself. Pinned here:
 *
 * 1. A missing code is generated server-side in the RPT- format, within the
 *    32-char column limit.
 * 2. A caller-supplied code is still honored (legacy/static paths).
 * 3. A unique-index collision on a generated code retries with a fresh code;
 *    any other insert error is rethrown untouched.
 */

let insertOutcomes: Array<() => unknown> = [];
const inserts: Array<Record<string, unknown>> = [];

const fakeDb = {
  insert: () => {
    const record = {} as Record<string, unknown>;
    const chain: any = {
      values: (v: Record<string, unknown>) => {
        Object.assign(record, v);
        return chain;
      },
      $returningId: async () => {
        inserts.push(record);
        const next = insertOutcomes.shift();
        if (next) return next();
        return [{ id: 51 }];
      },
    };
    return chain;
  },
};

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
vi.mock("bcryptjs", () => ({
  hash: vi.fn(async () => "hashed-placeholder"),
  compare: vi.fn(async () => true),
}));

let createRiskReport: typeof import("./db").createRiskReport;
let generateReportCode: typeof import("./db").generateReportCode;

beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  ({ createRiskReport, generateReportCode } = await import("./db"));
}, 60_000);

beforeEach(() => {
  insertOutcomes = [];
  inserts.length = 0;
});

const baseInput = {
  reportType: "Flooding",
  description: "Street is flooded",
  location: "Brgy. Sta. Ana",
};

describe("server-side incident IDs", () => {
  it("generates an RPT code within the column limit when the caller sends none", async () => {
    const created = await createRiskReport({ ...baseInput, reporterId: 3 });
    expect(created).toEqual({ id: 51 });
    const code = String(inserts[0].reportCode);
    expect(code).toMatch(/^RPT-/);
    expect(code.length).toBeLessThanOrEqual(32);
  });

  it("honors a caller-supplied code untouched (legacy clients)", async () => {
    await createRiskReport({ ...baseInput, reportCode: "CIT-1234567890" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].reportCode).toBe("CIT-1234567890");
  });

  it("retries with a fresh code on a unique-index collision", async () => {
    insertOutcomes = [
      () => {
        throw new Error("Duplicate entry 'RPT-X' for key 'risk_reports.reportCode'");
      },
    ];
    const created = await createRiskReport({ ...baseInput });
    expect(created).toEqual({ id: 51 });
    expect(inserts).toHaveLength(2);
    expect(inserts[0].reportCode).not.toBe(inserts[1].reportCode);
  });

  it("rethrows insert errors that are not code collisions", async () => {
    insertOutcomes = [
      () => {
        throw new Error("Connection lost");
      },
    ];
    await expect(createRiskReport({ ...baseInput })).rejects.toThrow("Connection lost");
    expect(inserts).toHaveLength(1);
  });

  it("generates distinct codes across calls", () => {
    expect(generateReportCode()).not.toBe(generateReportCode());
  });
});
