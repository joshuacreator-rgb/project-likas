import { describe, expect, it, vi } from "vitest";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, verifyLocalCredentials: vi.fn() };
});

describe("localAuth.login role choice", () => {
  it("accepts the stored role and rejects a mismatched selection", async () => {
    const { appRouter } = await import("./routers");
    const db = await import("./db");
    vi.mocked(db.verifyLocalCredentials).mockResolvedValue({ id: 7, openId: "local:test", name: "Test Responder", email: "responder@example.com", loginMethod: "password", role: "responder", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const ctx = { user: undefined, req: { protocol: "https", headers: {} }, res: { cookie: vi.fn(), clearCookie: vi.fn() } } as never;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.localAuth.login({ email: "responder@example.com", password: "password", role: "citizen" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.localAuth.login({ email: "responder@example.com", password: "password", role: "responder" })).resolves.toMatchObject({ user: { role: "responder" } });
  });
});
