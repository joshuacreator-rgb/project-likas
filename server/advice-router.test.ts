import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function context(role: "admin" | "staff" | "citizen"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: role === "admin" ? 1 : 2,
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
    } as unknown as User,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

const draftInput = {
  category: "EARTHQUAKE" as const,
  title: "What to do during shaking",
  titleFilipino: "Ano ang gagawin habang lumalakad",
  summary: "Drop, cover, and hold on until the shaking stops.",
  body: "Stay indoors away from windows until the shaking has passed.",
  steps: [{ title: "Drop", instruction: "Get down low and cover your head." }],
};

describe("safety advice is public", () => {
  it("serves published guidance to a visitor with no session", async () => {
    await expect(appRouter.createCaller(anonymousContext()).advice.list()).resolves.toEqual([]);
  });

  it("serves published guidance to a signed-in citizen", async () => {
    await expect(appRouter.createCaller(context("citizen")).advice.list()).resolves.toEqual([]);
  });

  it("rejects an unknown slug for anonymous callers", async () => {
    await expect(
      appRouter.createCaller(anonymousContext()).advice.detail({ slug: "not-a-real-slug" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("safety advice authoring is admin only", () => {
  it("rejects anonymous callers from the admin list", async () => {
    // adminProcedure reports a missing session as FORBIDDEN, matching the rest of
    // the admin surface; what matters is that anonymous callers never get in.
    await expect(appRouter.createCaller(anonymousContext()).advice.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects citizens and staff from the admin list", async () => {
    await expect(appRouter.createCaller(context("citizen")).advice.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(appRouter.createCaller(context("staff")).advice.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects non-admins from creating guidance", async () => {
    await expect(
      appRouter.createCaller(context("citizen")).advice.create(draftInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      appRouter.createCaller(context("staff")).advice.create(draftInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects non-admins from changing publishing status", async () => {
    await expect(
      appRouter.createCaller(context("citizen")).advice.setStatus({ id: 1, status: "PUBLISHED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects non-admins from deleting guidance", async () => {
    await expect(
      appRouter.createCaller(context("citizen")).advice.remove({ id: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects non-admins from uploading step photos", async () => {
    await expect(
      appRouter
        .createCaller(context("staff"))
        .advice.uploadStepImage({ fileName: "a.jpg", mimeType: "image/jpeg", dataBase64: "AAA=" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("safety advice input validation", () => {
  it("rejects a hazard category outside the taxonomy", async () => {
    await expect(
      appRouter.createCaller(context("admin")).advice.create({
        ...draftInput,
        category: "VOLCANIC_ASH",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a real summary and body before anything can be saved", async () => {
    await expect(
      appRouter.createCaller(context("admin")).advice.create({ ...draftInput, summary: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      appRouter.createCaller(context("admin")).advice.create({ ...draftInput, body: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("caps the number of steps so one item cannot grow unbounded", async () => {
    const steps = Array.from({ length: 31 }, (_, index) => ({ title: `Step ${index + 1}` }));
    await expect(
      appRouter.createCaller(context("admin")).advice.create({ ...draftInput, steps }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});