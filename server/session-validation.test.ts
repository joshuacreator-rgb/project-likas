import { beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

/**
 * Session validation for the local (likas_session) cookie.
 *
 * These cases exist because validation used to be written as
 *   `!found || !found.activeSessionToken || !sessionId || found.activeSessionToken === sessionId`
 * which treated a NULL stored token — exactly what logout writes — as valid, so a
 * captured cookie kept authenticating after sign-out. Each test pins one branch.
 */
const mockDb = vi.hoisted(() => ({ getUserById: vi.fn() }));
vi.mock("./db", () => mockDb);
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn(async () => null) } }));

const SECRET = "session-validation-test-secret";
let authenticateRequest: typeof import("./_core/context").authenticateRequest;

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  ({ authenticateRequest } = await import("./_core/context"));
});

type JwtPayload = { sub: string | number; sid?: string };

async function cookieFor(payload: JwtPayload) {
  const builder = new SignJWT({ ...(payload.sid ? { sid: payload.sid } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime("7d");
  const token = await builder.sign(new TextEncoder().encode(SECRET));
  return `likas_session=${token}`;
}

const reqWith = (cookie: string) => ({ headers: { cookie } }) as Parameters<typeof authenticateRequest>[0];

describe("local session validation", () => {
  it("accepts a cookie whose sid matches the stored token", async () => {
    mockDb.getUserById.mockResolvedValue({ id: 7, activeSessionToken: "sid-live" });
    const user = await authenticateRequest(reqWith(await cookieFor({ sub: 7, sid: "sid-live" })));
    expect(user?.id).toBe(7);
  });

  it("rejects a captured cookie after logout, when the stored token is null", async () => {
    // Regression: logout writes activeSessionToken = null, and the old validator
    // read that as "no enforcement" and let the cookie straight back in.
    mockDb.getUserById.mockResolvedValue({ id: 7, activeSessionToken: null });
    const user = await authenticateRequest(reqWith(await cookieFor({ sub: 7, sid: "sid-live" })));
    expect(user).toBeNull();
  });

  it("rejects a cookie superseded by a newer sign-in", async () => {
    mockDb.getUserById.mockResolvedValue({ id: 7, activeSessionToken: "sid-newer" });
    const user = await authenticateRequest(reqWith(await cookieFor({ sub: 7, sid: "sid-older" })));
    expect(user).toBeNull();
  });

  it("rejects a cookie with no sid claim", async () => {
    mockDb.getUserById.mockResolvedValue({ id: 7, activeSessionToken: "sid-live" });
    const user = await authenticateRequest(reqWith(await cookieFor({ sub: 7 })));
    expect(user).toBeNull();
  });

  it("rejects a cookie for a user that no longer exists", async () => {
    mockDb.getUserById.mockResolvedValue(null);
    const user = await authenticateRequest(reqWith(await cookieFor({ sub: 404, sid: "sid-live" })));
    expect(user).toBeNull();
  });
});
