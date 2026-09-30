import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, verifyLocalCredentials: vi.fn() };
});

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-local-auth";
});

describe("localAuth.login role choice", () => {
  // Loads the real ./db module (bcrypt, drizzle, etc.) so this runs slower than
  // unit tests; an explicit timeout keeps it from tripping the 5s default.
  it(
    "accepts the stored role and rejects a mismatched selection",
    async () => {
      const { appRouter } = await import("./routers");
      const db = await import("./db");
      vi.mocked(db.verifyLocalCredentials).mockResolvedValue({
        id: 7,
        openId: "local:test",
        name: "Test Responder",
        email: "responder@example.com",
        loginMethod: "password",
        role: "responder",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      });
      const ctx = {
        user: undefined,
        req: { protocol: "https", headers: {} },
        res: { cookie: vi.fn(), clearCookie: vi.fn() },
      } as never;
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.localAuth.login({
          email: "responder@example.com",
          password: "password",
          role: "citizen",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.localAuth.login({
          email: "responder@example.com",
          password: "password",
          role: "responder",
        }),
      ).resolves.toMatchObject({ user: { role: "responder" } });
    },
    20_000,
  );
});