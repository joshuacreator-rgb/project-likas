import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { getAuthErrorMessage } from "../shared/auth-feedback";

const mockedDb = vi.hoisted(() => ({
  verifyLocalCredentials: vi.fn(),
  registerLocalUser: vi.fn(),
  updateUserApproval: vi.fn(),
  verifyLocalEmail: vi.fn(),
  getUserById: vi.fn(),
  verifyUserTotp: vi.fn(),
  provisionDemoAccount: vi.fn(),
  provisionDemoAccounts: vi.fn(),
  listDemoAccounts: vi.fn(),
  revokeDemoAccount: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
const mockedEmail = vi.hoisted(() => ({ sendVerificationEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./db", () => mockedDb);
vi.mock("./_core/email", () => mockedEmail);

let appRouter: typeof import("./routers").appRouter;

const user = (role: "admin" | "responder") => ({
  id: role === "admin" ? 1 : 2,
  openId: `${role}-security-test`,
  email: `${role}@example.com`,
  name: role,
  loginMethod: "password",
  role,
  phone: null,
  isDemo: false,
  demoExpiresAt: null,
  twoFactorSecret: "JBSWY3DPEHPK3PXP",
  twoFactorEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

function context(currentUser: TrpcContext["user"] = null) {
  return {
    user: currentUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  } satisfies TrpcContext;
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-for-auth-security";
  ({ appRouter } = await import("./routers"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth security procedures", () => {
  it("maps login and 2FA failures to clear recovery guidance", () => {
    expect(getAuthErrorMessage("Invalid email or password", "login")).toContain("Check your email and password");
    expect(getAuthErrorMessage("This account is registered as admin", "login")).toContain("Select the matching role card");
    expect(getAuthErrorMessage("The security challenge has expired", "2fa")).toContain("verification window expired");
    expect(getAuthErrorMessage("That verification code is not valid", "2fa")).toContain("authenticator app");
  });
  it("rejects privileged self-registration even when a role is supplied by the client", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.localAuth.register({ name: "Admin Attempt", email: "admin-attempt@gmail.com", password: "secure-password-123", role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires Gmail for citizen self-registration", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.localAuth.register({ name: "Non Gmail", email: "non-gmail@example.com", password: "secure-password-123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockedDb.registerLocalUser).not.toHaveBeenCalled();
  });

  it("places a newly registered citizen in the administrator approval queue", async () => {
    const created = { userId: 7, openId: "local:new-citizen", email: "new@gmail.com", name: "New Citizen", role: "citizen" as const };
    mockedDb.registerLocalUser.mockResolvedValue(created);
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    const caller = appRouter.createCaller({ user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: response as unknown as TrpcContext["res"] });

    await expect(caller.localAuth.register({ name: created.name, email: created.email, password: "valid-password-123" })).resolves.toMatchObject({ approvalRequired: true, email: created.email, approvalToken: expect.any(String) });
    expect(mockedDb.registerLocalUser).toHaveBeenCalledWith({ name: created.name, email: created.email, password: "valid-password-123", role: "citizen" });
    expect(mockedEmail.sendVerificationEmail).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("blocks a citizen login until an administrator approves the account", async () => {
    mockedDb.verifyLocalCredentials.mockResolvedValue({ ...user("admin"), role: "citizen", accountStatus: "PENDING" });
    const caller = appRouter.createCaller(context());

    await expect(caller.localAuth.login({ email: "pending@gmail.com", password: "valid-password-123", role: "citizen" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Your account is waiting for Administrator approval." });
  });

  it("allows an administrator to approve a citizen registration", async () => {
    mockedDb.updateUserApproval.mockResolvedValue({ userId: 7, accountStatus: "APPROVED" });
    const caller = appRouter.createCaller(context(user("admin")));

    await expect(caller.admin.updateUserApproval({ userId: 7, accountStatus: "APPROVED" })).resolves.toEqual({ userId: 7, accountStatus: "APPROVED" });
    expect(mockedDb.updateUserApproval).toHaveBeenCalledWith(7, "APPROVED");
  });

  it("issues the citizen session only after approval is complete", async () => {
    const caller = appRouter.createCaller(context());
    const approvalToken = await new (await import("jose")).SignJWT({ type: "citizen-approval" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("7")
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    mockedDb.getUserById.mockResolvedValue({ ...user("admin"), role: "citizen", accountStatus: "APPROVED" });
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    const sessionCaller = appRouter.createCaller({ user: null, req: { protocol: "http", headers: {} } as TrpcContext["req"], res: response as unknown as TrpcContext["res"] });

    await expect(sessionCaller.localAuth.completeApproval({ token: approvalToken })).resolves.toMatchObject({ user: { role: "citizen" } });
    expect(response.cookie).toHaveBeenCalledWith("likas_session", expect.any(String), expect.objectContaining({ maxAge: 7 * 24 * 60 * 60 * 1000 }));
  });

  it("allows an administrator to provision a temporary role-based demo account", async () => {
    const created = { userId: 44, email: "demo.responder.ab12cd34@likas.training", password: "Likas-training-2026", role: "responder" as const, expiresAt: new Date("2026-08-30T00:00:00Z"), provisionedBy: 1 };
    mockedDb.provisionDemoAccount.mockResolvedValue(created);
    const caller = appRouter.createCaller(context(user("admin")));

    await expect(caller.admin.provisionDemoAccount({ name: "Response Drill", role: "responder", expiresInDays: 7 })).resolves.toEqual(created);
    expect(mockedDb.provisionDemoAccount).toHaveBeenCalledWith({ name: "Response Drill", role: "responder", expiresInDays: 7 }, 1);
    expect(mockedDb.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "DEMO_PROVISIONED", entityId: 44 }));
  });

  it("keeps demo-account monitoring and revocation administrator-only", async () => {
    mockedDb.listDemoAccounts.mockResolvedValue([]);
    const adminCaller = appRouter.createCaller(context(user("admin")));
    await expect(adminCaller.admin.demoAccounts()).resolves.toEqual([]);

    const citizenCaller = appRouter.createCaller(context({ ...user("admin"), role: "citizen" }));
    await expect(citizenCaller.admin.demoAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(citizenCaller.admin.revokeDemoAccount({ userId: 44 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an administrator to provision one temporary demo account for every role", async () => {
    const created = ["admin", "staff", "responder", "citizen"].map((role, index) => ({ userId: index + 1, role }));
    mockedDb.provisionDemoAccounts.mockResolvedValue(created);
    const caller = appRouter.createCaller(context(user("admin")));

    await expect(caller.admin.provisionDemoAccounts({ expiresInDays: 7 })).resolves.toEqual(created);
    expect(mockedDb.provisionDemoAccounts).toHaveBeenCalledWith(7, 1);
  });

  it("allows an administrator to revoke a demo account and records the audit event", async () => {
    const revoked = { userId: 44, revoked: true, alreadyRevoked: false as const };
    mockedDb.revokeDemoAccount.mockResolvedValue(revoked);
    const caller = appRouter.createCaller(context(user("admin")));

    await expect(caller.admin.revokeDemoAccount({ userId: 44 })).resolves.toEqual(revoked);
    expect(mockedDb.revokeDemoAccount).toHaveBeenCalledWith(44, 1);
    expect(mockedDb.logActivity).toHaveBeenCalledWith({ actorId: 1, action: "DEMO_REVOKED", entityType: "user", entityId: 44 });
  });

  it("does not require 2FA for an enabled administrator login", async () => {
    const admin = { ...user("admin"), twoFactorEnabled: true };
    mockedDb.verifyLocalCredentials.mockResolvedValue(admin);
    mockedDb.verifyUserTotp.mockResolvedValue(true);
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    const caller = appRouter.createCaller({ user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: response as unknown as TrpcContext["res"] });

    const result = await caller.localAuth.login({ email: admin.email!, password: "valid-password", role: "admin" });
    expect(result.requiresTwoFactor).toBe(false);
    expect(response.cookie).toHaveBeenCalledTimes(1);
    expect(mockedDb.verifyUserTotp).not.toHaveBeenCalled();
  });
});
