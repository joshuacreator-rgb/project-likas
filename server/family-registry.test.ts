import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Client §27 drives two db functions behind the staff family flows:
 *
 * 1. registerFamily ("Add Another Family") files every member under the NEW
 *    head's household in one transaction — a family is never half-created —
 *    books the whole family's occupancy, and refuses a family that does not
 *    fit the center.
 * 2. removeHouseholdMember deletes the member's registry row, gives the center
 *    slot back, and refuses to remove the household head (that would orphan
 *    the family).
 */

let selectRows: unknown[][] = [];
const inserts: Array<{ values: Record<string, unknown> }> = [];
const updates: Array<{ setValues: Record<string, unknown> }> = [];
let deletes = 0;
let nextId = 91;

const fakeDb: any = {
  transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(fakeDb),
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
        return [{ id: nextId++ }];
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
  delete: () => {
    const chain: any = {
      where: async () => {
        deletes += 1;
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

let registerFamily: typeof import("./db").registerFamily;
let removeHouseholdMember: typeof import("./db").removeHouseholdMember;

beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  ({ registerFamily, removeHouseholdMember } = await import("./db"));
}, 60_000);

beforeEach(() => {
  selectRows = [];
  inserts.length = 0;
  updates.length = 0;
  deletes = 0;
  nextId = 91;
});

const openCenter = { id: 3, name: "Test Evacuation Center", maximumCapacity: 50, currentOccupancy: 10, status: "OPEN" };

describe("registerFamily", () => {
  it("files the head and every member under the NEW household in one pass", async () => {
    selectRows = [[openCenter]];

    const result = await registerFamily(
      { firstName: "Mila", lastName: "Cluster", age: 42, centerId: 3, status: "ACTIVE" },
      [
        { firstName: "Nico", lastName: "Cluster", age: 10, centerId: 3, status: "ACTIVE" },
        { firstName: "Ana", lastName: "Cluster", age: 38, centerId: 3, status: "ACTIVE" },
      ]
    );

    expect(result).toEqual({ headId: 91, memberIds: [92, 93] });
    // The head carries the Head relationship and becomes its own household…
    expect(inserts[0].values.relationshipToHead).toBe("Head");
    expect(updates[0].setValues).toEqual({ householdId: 91 });
    // …and both members are filed under THAT new household, not a selected one.
    expect(inserts[1].values.householdId).toBe(91);
    expect(inserts[2].values.householdId).toBe(91);
    // One occupancy update books every slot the family takes (3 = head + 2).
    expect(updates).toHaveLength(2);
    expect(updates[1].setValues).toHaveProperty("currentOccupancy");
    expect(updates[1].setValues).toHaveProperty("status");
  });

  it("refuses a family that does not fit the center's open slots", async () => {
    selectRows = [[{ ...openCenter, currentOccupancy: 49 }]];

    await expect(
      registerFamily({ firstName: "Mila", lastName: "Cluster", age: 42, centerId: 3, status: "ACTIVE" }, [
        { firstName: "Nico", lastName: "Cluster", age: 10, centerId: 3, status: "ACTIVE" },
      ])
    ).rejects.toThrow(/has 1 open slot\(s\), but this family needs 2/);
    // Nothing may be inserted when the precheck fails — no half-created family.
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(deletes).toBe(0);
  });

  it("refuses a center that is not open for new evacuees", async () => {
    selectRows = [[{ ...openCenter, status: "UNDER_MAINTENANCE" }]];

    await expect(
      registerFamily({ firstName: "Mila", lastName: "Cluster", age: 42, centerId: 3, status: "ACTIVE" }, [])
    ).rejects.toThrow(/is not open for new evacuees/);
    expect(inserts).toHaveLength(0);
  });
});

describe("removeHouseholdMember", () => {
  it("deletes the member row and gives the center slot back", async () => {
    selectRows = [[{ id: 77, householdId: 55, centerId: 3, status: "ACTIVE", firstName: "Ana", lastName: "Cluster" }]];

    const result = await removeHouseholdMember(77);

    expect(result).toEqual({ evacueeId: 77, householdId: 55 });
    expect(deletes).toBe(1);
    // Occupancy drops by one, and a FULL center reopens when the slot frees up.
    expect(updates).toHaveLength(2);
    expect(updates[0].setValues).toHaveProperty("currentOccupancy");
    expect(updates[1].setValues).toHaveProperty("status");
  });

  it("refuses to remove the household head", async () => {
    selectRows = [[{ id: 77, householdId: 77, centerId: 3, status: "ACTIVE" }]];

    await expect(removeHouseholdMember(77)).rejects.toThrow(/head of a household cannot be removed/);
    expect(deletes).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("refuses to remove a standalone registrant (no household to leave)", async () => {
    selectRows = [[{ id: 77, householdId: null, centerId: 3, status: "ACTIVE" }]];

    await expect(removeHouseholdMember(77)).rejects.toThrow(/head of a household cannot be removed/);
    expect(deletes).toBe(0);
  });

  it("does not touch occupancy for a member that was already released", async () => {
    selectRows = [[{ id: 77, householdId: 55, centerId: 3, status: "RELEASED" }]];

    await expect(removeHouseholdMember(77)).resolves.toEqual({ evacueeId: 77, householdId: 55 });
    expect(deletes).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it("reports an unknown member", async () => {
    selectRows = [[]];

    await expect(removeHouseholdMember(77)).rejects.toThrow(/Evacuee not found/);
    expect(deletes).toBe(0);
  });
});
