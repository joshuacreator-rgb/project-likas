import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mockedDb = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
const mockedEmail = vi.hoisted(() => ({
  sendInvitationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("./db", () => mockedDb);
vi.mock("./_core/email", () => mockedEmail);

let appRouter: typeof import("./routers").appRouter;

const admin: TrpcContext["user"] = {
  id: 1,
  openId: "local:admin",
  email: "admin@example.com",
  name: "Admin",
  loginMethod: "password",
  role: "admin",
  phone: null,
  isDemo: false,
  demoExpiresAt: null,
  twoFactorSecret: null,
  twoFactorEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function context(): TrpcContext {
  return {
    user: admin,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const createdInvitation = {
  id: 7,
  email: "joe@example.com",
  name: "Joe Responder",
  role: "responder" as const,
  expiresAt: new Date(),
  inviteToken: "invite-token-123",
};

beforeAll(async () => {
  ({ appRouter } = await import("./routers"));
});

beforeEach(() => {
  vi.resetAllMocks();
  mockedDb.createInvitation.mockResolvedValue(createdInvitation);
  mockedDb.logActivity.mockResolvedValue(undefined);
  mockedEmail.sendInvitationEmail.mockResolvedValue({ sent: true });
  mockedEmail.sendPasswordResetEmail.mockResolvedValue(undefined);
});

describe("createInvitation email reporting", () => {
  it("returns emailSent true and the invite link when the email is delivered", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.admin.createInvitation({
      email: createdInvitation.email,
      name: createdInvitation.name,
      role: "responder",
    });

    expect(mockedDb.createInvitation).toHaveBeenCalledWith(
      { email: "joe@example.com", name: "Joe Responder", role: "responder" },
      1,
    );
    expect(mockedEmail.sendInvitationEmail).toHaveBeenCalledWith({
      email: "joe@example.com",
      name: "Joe Responder",
      role: "responder",
      inviteUrl: expect.stringContaining(
        "/accept-invitation?token=invite-token-123",
      ),
    });
    expect(result.emailSent).toBe(true);
    expect(result.emailError).toBeUndefined();
    expect(result.inviteUrl).toBe(
      "http://localhost:5173/accept-invitation?token=invite-token-123",
    );
  });

  it("reports the failure reason while keeping the invitation usable", async () => {
    mockedEmail.sendInvitationEmail.mockResolvedValue({
      sent: false,
      error: "Resend rejected the email (status 422): blocked sender",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const caller = appRouter.createCaller(context());
    const result = await caller.admin.createInvitation({
      email: "staff@example.com",
      name: "Staff One",
      role: "staff",
    });

    expect(result.emailSent).toBe(false);
    expect(result.emailError).toContain("Resend rejected the email");
    expect(result.inviteUrl).toContain("token=invite-token-123");
    // The failure reason is also written to the server log (email comes from the created invitation).
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Invite] Email failed for joe@example.com"),
    );
    // The invitation itself is still created and audited.
    expect(mockedDb.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "INVITE", entityId: 7 }),
    );
    warnSpy.mockRestore();
  });

  it("reflects unconfigured email settings in the response", async () => {
    mockedEmail.sendInvitationEmail.mockResolvedValue({
      sent: false,
      error: "RESEND_API_KEY or EMAIL_FROM is not configured.",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const caller = appRouter.createCaller(context());
    const result = await caller.admin.createInvitation({
      email: "staff@example.com",
      name: "Staff One",
      role: "staff",
    });

    expect(result.emailSent).toBe(false);
    expect(result.emailError).toBe(
      "RESEND_API_KEY or EMAIL_FROM is not configured.",
    );
    warnSpy.mockRestore();
  });
});