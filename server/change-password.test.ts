import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mockedDb = vi.hoisted(() => ({
  changeLocalPassword: vi.fn(),
}));
vi.mock("./db", () => mockedDb);

let appRouter: typeof import("./routers").appRouter;
let caller: ReturnType<typeof appRouter.createCaller>;

const INCORRECT = "Current password is incorrect";

function context(userId: number | null): TrpcContext {
  return {
    user: userId === null ? null : { id: userId, role: "admin" },
    req: { protocol: "https", headers: {} } as unknown as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-for-change-password";
  ({ appRouter } = await import("./routers"));
  caller = appRouter.createCaller(context(1));
});

beforeEach(() => {
  vi.resetAllMocks();
  mockedDb.changeLocalPassword.mockResolvedValue({ success: true });
});

describe("changePassword", () => {
  it("changes the password for the signed-in user only", async () => {
    const result = await caller.localAuth.changePassword({
      currentPassword: "old-password-123",
      newPassword: "new-password-456",
    });

    expect(result).toEqual({ success: true });
    expect(mockedDb.changeLocalPassword).toHaveBeenCalledWith(
      1,
      "old-password-123",
      "new-password-456",
    );
  });

  it("requires authentication", async () => {
    const anonymous = appRouter.createCaller(context(null));
    await expect(
      anonymous.localAuth.changePassword({
        currentPassword: "old-password-123",
        newPassword: "new-password-456",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockedDb.changeLocalPassword).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than the 10 character minimum", async () => {
    await expect(
      caller.localAuth.changePassword({
        currentPassword: "old-password-123",
        newPassword: "short1234",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockedDb.changeLocalPassword).not.toHaveBeenCalled();
  });

  it("rejects an empty current password", async () => {
    await expect(
      caller.localAuth.changePassword({
        currentPassword: "",
        newPassword: "new-password-456",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockedDb.changeLocalPassword).not.toHaveBeenCalled();
  });

  it("reports a wrong current password as UNAUTHORIZED, not a server fault", async () => {
    mockedDb.changeLocalPassword.mockRejectedValue(new Error(INCORRECT));

    await expect(
      caller.localAuth.changePassword({
        currentPassword: "wrong-password-999",
        newPassword: "new-password-456",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
  });

  it("does not disguise an unexpected database fault as an auth failure", async () => {
    mockedDb.changeLocalPassword.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      caller.localAuth.changePassword({
        currentPassword: "old-password-123",
        newPassword: "new-password-456",
      }),
    ).rejects.not.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses to set the new password identical to the current one", async () => {
    await expect(
      caller.localAuth.changePassword({
        currentPassword: "same-password-123",
        newPassword: "same-password-123",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockedDb.changeLocalPassword).not.toHaveBeenCalled();
  });

  it("rate limits repeated attempts so a stolen session cannot grind the password", async () => {
    // A distinct user id gives this test its own bucket, so the calls made by
    // the earlier tests cannot eat into the budget being asserted here.
    const rateLimited = appRouter.createCaller(context(4242));

    for (let attempt = 0; attempt < 5; attempt++) {
      await rateLimited.localAuth.changePassword({
        currentPassword: "guess-password-123",
        newPassword: "new-password-456",
      });
    }
    expect(mockedDb.changeLocalPassword).toHaveBeenCalledTimes(5);

    await expect(
      rateLimited.localAuth.changePassword({
        currentPassword: "guess-password-123",
        newPassword: "new-password-456",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mockedDb.changeLocalPassword).toHaveBeenCalledTimes(5);
  });

  it("does not charge the rate limit budget for a request rejected before hashing", async () => {
    const guarded = appRouter.createCaller(context(4343));

    for (let attempt = 0; attempt < 10; attempt++) {
      await expect(
        guarded.localAuth.changePassword({
          currentPassword: "identical-password-1",
          newPassword: "identical-password-1",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mockedDb.changeLocalPassword).not.toHaveBeenCalled();
  });
});
