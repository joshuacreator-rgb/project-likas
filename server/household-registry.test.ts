import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The registry guard lives in registerHouseholdHead, so this file drives the db
 * function directly. Two rules are pinned here:
 *
 * 1. An account that already has a head-of-household row never gets a second
 *    one (spec 5.4 — duplicate registry entries must be prevented).
 * 2. A newly created head row carries the account link (spec 5.3) and the Head
 *    relationship (spec 5.5), and becomes its own household.
 */

let selectRows: unknown[][] = [];
const inserts: Array<{ values: Record<string, unknown> }> = [];
const updates: Array<{ setValues: Record<string, unknown> }> = [];

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => selectRows.shift() ?? [],
    };
    return chain;
  },
  insert: () => {
    const record = { values: {} as Record<string, unknown> };
    const chain: any = {
      values: (v: Record<string, unknown>) => {
        record.values = v;
        return chain;
      },
      $returningId: async () => {
        inserts.push(record);
        return [{ id: 91 }];
      },
    };
    return chain;
  },
  update: () => {
    const record = { setValues: {} as Record<string, unknown> };
    const chain: any = {
      set: (v: Record<string, unknown>) => {
        record.setValues = v;
        return chain;
      },
      where: async () => {
        updates.push(record);
        return undefined;
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

let registerHouseholdHead: typeof import("./db").registerHouseholdHead;

beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  ({ registerHouseholdHead } = await import("./db"));
}, 60_000);

beforeEach(() => {
  selectRows = [];
  inserts.length = 0;
  updates.length = 0;
});

describe("head-of-household registry guard", () => {
  it("returns the existing row instead of creating a second head for the same account", async () => {
    selectRows = [[{ id: 55 }]];

    const result = await registerHouseholdHead({
      userId: 7,
      firstName: "Ana",
      middleName: null,
      lastName: "Resident",
      age: 30,
    });

    expect(result).toEqual({ id: 55, existing: true });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("creates the head row linked to the account with the Head relationship", async () => {
    selectRows = [[]];

    const result = await registerHouseholdHead({
      userId: 7,
      firstName: "Ana",
      middleName: "M",
      lastName: "Resident",
      age: 30,
      phone: "09171234567",
      address: "123 Test Street, Pateros",
    });

    expect(result).toEqual({ id: 91, existing: false });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values.userId).toBe(7);
    expect(inserts[0].values.relationshipToHead).toBe("Head");
    expect(inserts[0].values.status).toBe("ACTIVE");
    expect(inserts[0].values.centerId).toBeNull();
    // The head becomes its own household: householdId points at its own row.
    expect(updates).toHaveLength(1);
    expect(updates[0].setValues).toEqual({ householdId: 91 });
  });

  it("still creates a head for a caller that has no account to link", async () => {
    selectRows = [[]];

    const result = await registerHouseholdHead({
      firstName: "Walk-in",
      middleName: null,
      lastName: "Resident",
      age: 40,
    });

    expect(result).toEqual({ id: 91, existing: false });
    expect(inserts[0].values.userId).toBeNull();
  });
});
