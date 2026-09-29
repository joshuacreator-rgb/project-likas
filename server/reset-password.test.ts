import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { generateResetToken, hashResetToken, verifyResetToken } from "./resetTokens";

const mockedDb = vi.hoisted(() => ({
  issuePasswordReset: vi.fn(),
  getUserByEmail: vi.fn(),
  resetLocalPassword: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
const mockedEmail = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
}));
vi.mock("./db", () => mockedDb);
vi.mock("./_core/email", () => mockedEmail);

let appRouter: typeof import("./routers").appRouter;

function context(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-for-reset-password";
  ({ appRouter } = await import("./routers"));
});

beforeEach(() => {
  vi.resetAllMocks();
  mockedDb.issuePasswordReset.mockResolvedValue("dev-token-123");
  mockedDb.getUserByEmail.mockResolvedValue({ id: 1, name: "Test User", email: "dev@example.com" });
  mockedDb.resetLocalPassword.mockResolvedValue({ success: true });
  mockedEmail.sendPasswordResetEmail.mockResolvedValue(undefined);
  mockedEmail.sendInvitationEmail.mockResolvedValue(undefined);
});

describe("reset token helpers", () => {
  it("hashes a token deterministically and never stores it in plaintext", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
    expect(hashResetToken(token)).not.toBe(token);
  });

  it("verifies the correct token and rejects wrong, tampered, or empty values", () => {
    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    expect(verifyResetToken(token, tokenHash)).toBe(true);
    expect(verifyResetToken("some-other-token", tokenHash)).toBe(false);
    expect(verifyResetToken(token, `${tokenHash.slice(0, -2)}00`)).toBe(false);
    expect(verifyResetToken(token, "")).toBe(false);
  });
});

describe("forgotPassword procedure", () => {
  it("issues a token, emails a reset link, and returns the token in development", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.localAuth.forgotPassword({ email: "dev@example.com" });

    expect(result.accepted).toBe(true);
    expect(result.devToken).toBe("dev-token-123");
    expect(result.resetUrl).toContain("/recover?email=dev%40example.com&token=dev-token-123");
    expect(mockedDb.issuePasswordReset).toHaveBeenCalledWith("dev@example.com");
    expect(mockedDb.getUserByEmail).toHaveBeenCalledWith("dev@example.com");
    expect(mockedEmail.sendPasswordResetEmail).toHaveBeenCalledWith({
      email: "dev@example.com",
      name: "Test User",
      resetUrl: expect.stringContaining("token=dev-token-123"),
    });
  });

  it("never returns the token or reset link in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      mockedDb.issuePasswordReset.mockResolvedValue("prod-token");
      const caller = appRouter.createCaller(context());
      const result = await caller.localAuth.forgotPassword({ email: "prod@example.com" });

      expect(result.accepted).toBe(true);
      expect(result.devToken).toBeUndefined();
      expect(result.resetUrl).toBeUndefined();
      expect(mockedEmail.sendPasswordResetEmail).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("surfaces an unknown-email failure without emailing anyone", async () => {
    mockedDb.issuePasswordReset.mockRejectedValue(new Error("No account found with this email address."));
    const caller = appRouter.createCaller(context());

    await expect(
      caller.localAuth.forgotPassword({ email: "missing@example.com" }),
    ).rejects.toThrow("No account found with this email address.");
    expect(mockedEmail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("rate limits reset requests per email address", async () => {
    const caller = appRouter.createCaller(context());
    for (let i = 0; i < 5; i += 1) {
      await caller.localAuth.forgotPassword({ email: "burst@example.com" });
    }
    await expect(
      caller.localAuth.forgotPassword({ email: "burst@example.com" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // A different email is not blocked by the same bucket.
    await expect(
      caller.localAuth.forgotPassword({ email: "other@example.com" }),
    ).resolves.toMatchObject({ accepted: true });
  });
});

describe("resetPassword procedure", () => {
  it("passes the submitted credentials to the database layer", async () => {
    const caller = appRouter.createCaller(context());

    await expect(
      caller.localAuth.resetPassword({
        email: "reset@example.com",
        token: "valid-token-123",
        newPassword: "new-secure-password",
      }),
    ).resolves.toEqual({ success: true });
    expect(mockedDb.resetLocalPassword).toHaveBeenCalledWith(
      "reset@example.com",
      "valid-token-123",
      "new-secure-password",
    );
  });

  it("surfaces an invalid-token failure", async () => {
    mockedDb.resetLocalPassword.mockRejectedValue(new Error("Reset token is invalid. Please check the token and try again."));
    const caller = appRouter.createCaller(context());

    await expect(
      caller.localAuth.resetPassword({
        email: "reset@example.com",
        token: "wrong-token-123",
        newPassword: "new-secure-password",
      }),
    ).rejects.toThrow("Reset token is invalid");
  });
});