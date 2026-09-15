import { describe, expect, it, vi } from "vitest";

vi.mock("./db", async (importOriginal) => ({ ...(await importOriginal<typeof import("./db")>()), acceptInvitation: vi.fn().mockRejectedValue(new Error("Invitation token is invalid or expired")) }));
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { isInvitationUsable, isInvitableRole, onboardingSteps, requiresTwoFactor, roleBrands } from "../shared/roles";
import { totpCodeForTesting, verifyTotpCode } from "./totp";

function context(role: "admin" | "citizen" | "responder"): TrpcContext {
  const now = new Date();
  return { user: { id: role === "admin" ? 1 : 2, openId: `${role}-test`, email: `${role}@example.com`, name: role, loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("account flows", () => {
  it("limits administrator invitations to staff and responders", () => {
    expect(isInvitableRole("staff")).toBe(true);
    expect(isInvitableRole("responder")).toBe(true);
    expect(isInvitableRole("admin")).toBe(false);
    expect(isInvitableRole("citizen")).toBe(false);
  });
  it("provides role-specific onboarding steps", () => {
    expect(onboardingSteps("admin")[1]).toContain("User & roles");
    expect(onboardingSteps("responder")[0]).toContain("Risk reports");
    expect(onboardingSteps("citizen")[2]).toContain("911");
  });
  it("rejects non-admin invitation listing and creation before database access", async () => {
    const caller = appRouter.createCaller(context("citizen"));
    await expect(caller.admin.invitations()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.createInvitation({ email: "staff@example.com", name: "Staff", role: "staff" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects expired and already-accepted invitation tokens", () => {
    const now = Date.now();
    expect(isInvitationUsable(now - 1, null, now)).toBe(false);
    expect(isInvitationUsable(now + 60_000, now - 1, now)).toBe(false);
    expect(isInvitationUsable(now + 60_000, null, now)).toBe(true);
  });
  it("keeps each login role tied to an organization and department identity", () => {
    expect(roleBrands.admin.organization).toBe("Pateros DRRM Office");
    expect(roleBrands.staff.department).toBe("Center Operations");
    expect(roleBrands.responder.mark).toBe("PRU");
    expect(roleBrands.citizen.organization).toBe("Pateros Community Safety");
  });
  it("requires 2FA only for enabled responder accounts", () => {
    expect(requiresTwoFactor("admin", true)).toBe(false);
    expect(requiresTwoFactor("responder", true)).toBe(true);
    expect(requiresTwoFactor("staff", true)).toBe(false);
    expect(requiresTwoFactor("citizen", true)).toBe(false);
    expect(requiresTwoFactor("admin", false)).toBe(false);
  });
  it("verifies six-digit TOTP codes within the one-step clock window", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = 1_725_000_000_000;
    const code = totpCodeForTesting(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, "000000", now)).toBe(false);
  });
  it("blocks citizen access to 2FA routes and demo provisioning", async () => {
    const caller = appRouter.createCaller(context("citizen"));
    await expect(caller.security.twoFactorStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.provisionDemoAccount({ name: "Training", role: "citizen", expiresInDays: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects an invalid 2FA login challenge before checking credentials", async () => {
    const caller = appRouter.createCaller(context("citizen"));
    await expect(caller.localAuth.verifyTwoFactor({ challengeToken: "invalid-challenge-token-123456", code: "000000" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects expired-or-reused tokens through the acceptance procedure", async () => {
    const caller = appRouter.createCaller(context("citizen"));
    await expect(caller.localAuth.acceptInvitation({ token: "expired-token-1234567890", password: "safe-password-123" })).rejects.toThrow("invalid or expired");
    await expect(caller.localAuth.acceptInvitation({ token: "reused-token-1234567890", password: "safe-password-123" })).rejects.toThrow("invalid or expired");
  });
});
