import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 3.7: the assignment dropdown must distinguish available responders from
 * ones already engaged on open incidents. The flag is computed in
 * listResponders, so this file drives that db function directly with a fake
 * db: every responder carries an openIncidentCount, and available is exactly
 * "no open (assigned, unresolved) incidents".
 */

let selectResults: unknown[][] = [];

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: async () => selectResults.shift() ?? [],
      groupBy: async () => selectResults.shift() ?? [],
    };
    return chain;
  },
};

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
vi.mock("bcryptjs", () => ({
  hash: vi.fn(async () => "hashed-placeholder"),
  compare: vi.fn(async () => true),
}));

let listResponders: typeof import("./db").listResponders;

beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  ({ listResponders } = await import("./db"));
}, 60_000);

beforeEach(() => {
  selectResults = [];
});

const responderRows = [
  { id: 1, name: "Ana One", email: "ana@x.com", accountStatus: "APPROVED", isDemo: false },
  { id: 2, name: "Ben Two", email: "ben@x.com", accountStatus: "APPROVED", isDemo: false },
  { id: 3, name: "Cara Three", email: "cara@x.com", accountStatus: "APPROVED", isDemo: false },
];

describe("responder availability (spec 3.7)", () => {
  it("marks everyone available when no incidents are assigned", async () => {
    selectResults = [responderRows, []];
    const rows = await listResponders();
    expect(rows.map(r => ({ id: r.id, available: r.available, open: r.openIncidentCount }))).toEqual([
      { id: 1, available: true, open: 0 },
      { id: 2, available: true, open: 0 },
      { id: 3, available: true, open: 0 },
    ]);
  });

  it("flags only the responders with open assigned incidents, keeping list order", async () => {
    selectResults = [responderRows, [{ responderId: 2, count: 3 }]];
    const rows = await listResponders();
    expect(rows.map(r => r.id)).toEqual([1, 2, 3]);
    expect(rows.find(r => r.id === 2)?.available).toBe(false);
    expect(rows.find(r => r.id === 2)?.openIncidentCount).toBe(3);
    expect(rows.find(r => r.id === 1)?.available).toBe(true);
    expect(rows.find(r => r.id === 3)?.available).toBe(true);
  });

  it("coerces the SQL count to a number before comparing", async () => {
    selectResults = [responderRows.slice(0, 1), [{ responderId: 1, count: "2" }]];
    const rows = await listResponders();
    expect(rows[0].openIncidentCount).toBe(2);
    expect(rows[0].available).toBe(false);
  });
});
