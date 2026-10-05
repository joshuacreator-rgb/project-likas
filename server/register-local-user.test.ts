import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The approval rule lives in `registerLocalUser`, not in the router, so testing
 * only the router would miss the defect entirely. This file exercises the db
 * function directly and asserts on the row it actually inserts.
 *
 * The bug being guarded: `registerLocalUser` hardcoded `accountStatus: "PENDING"`,
 * so a citizen who registered without an ID was refused at login, produced no
 * citizen_id_documents row, and therefore appeared in no review queue, because
 * the queue lists documents rather than accounts. Nobody could ever release them.
 */

const inserts: Array<{ values: Record<string, unknown> }> = [];

const fakeDb = {
  select: () => {
    // Every lookup in registerLocalUser is an existence check that must miss.
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => [],
    };
    return chain;
  },
  insert: () => {
    const record = { values: {} as Record<string, unknown> };
    const chain = {
      values: (v: Record<string, unknown>) => {
        record.values = v;
        return chain;
      },
      $returningId: async () => {
        inserts.push(record);
        return [{ id: 4242 }];
      },
      then: (resolve: (v: unknown) => unknown) => {
        inserts.push(record);
        return Promise.resolve(resolve(undefined));
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

const BASE = {
  email: "resident@example.com",
  password: "a-long-enough-password",
  name: "Ana Resident",
  firstName: "Ana",
  middleName: null,
  lastName: "Resident",
  address: "123 Test Street, Pateros",
  age: 30,
  phone: "09171234567",
  role: "citizen" as const,
};

let registerLocalUser: typeof import("./db").registerLocalUser;

// Importing the real db module pulls in the mysql2 driver and the full drizzle
// schema, which takes longer than the 10s default hook budget once the rest of
// the suite is running in parallel. The import happens once and is cached after
// that, so it belongs in beforeAll with an honest timeout rather than in
// beforeEach, where it was also being re-requested on every test.
beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  ({ registerLocalUser } = await import("./db"));
}, 60_000);

beforeEach(() => {
  inserts.length = 0;
});

/** The users row is always the first insert; the credential row is the second. */
const userRow = () => inserts[0].values;

describe("registerLocalUser approval rule", () => {
  it("approves a citizen who registered with no ID, so they are not locked out", async () => {
    await registerLocalUser({ ...BASE, hasValidId: false });

    expect(userRow().accountStatus).toBe("APPROVED");
  });

  it("holds a citizen PENDING when an ID document is attached for review", async () => {
    await registerLocalUser({ ...BASE, hasValidId: true });

    expect(userRow().accountStatus).toBe("PENDING");
  });

  it("never writes an undefined status, whatever the caller passes", async () => {
    await registerLocalUser({ ...BASE, hasValidId: undefined as unknown as boolean });

    // No ID attached is the falsy branch, and it must still be a real status.
    expect(["APPROVED", "PENDING"]).toContain(userRow().accountStatus);
  });

  it("always creates the credential row, whichever branch it took", async () => {
    await registerLocalUser({ ...BASE, hasValidId: false });

    expect(inserts).toHaveLength(2);
    expect(inserts[1].values.userId).toBe(4242);
    expect(inserts[1].values.email).toBe("resident@example.com");
  });

  it("normalises the email so the same person cannot register twice", async () => {
    await registerLocalUser({
      ...BASE,
      email: "  Resident@Example.COM  ",
      hasValidId: false,
    });

    expect(userRow().email).toBe("resident@example.com");
  });
});