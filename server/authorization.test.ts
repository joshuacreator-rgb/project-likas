import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(role: "admin" | "citizen"): TrpcContext {
  const now = new Date();
  return { user: { id: role === "admin" ? 1 : 2, openId: `${role}-test`, email: `${role}@example.com`, name: role, loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("role authorization", () => {
  it("allows administrators to access admin health", async () => {
    await expect(appRouter.createCaller(context("admin")).admin.health()).resolves.toEqual({ ok: true, scope: "admin" });
  });
  it("rejects citizens from admin health", async () => {
    await expect(appRouter.createCaller(context("citizen")).admin.health()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects citizens from changing user roles", async () => {
    await expect(appRouter.createCaller(context("citizen")).admin.updateUserRole({ userId: 1, role: "responder" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
