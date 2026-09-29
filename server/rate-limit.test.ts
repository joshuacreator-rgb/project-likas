import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { clearRateLimit, clientIpOf, enforceRateLimit, rateLimitHit } from "./_core/rateLimit";

const makeReq = (remoteAddress = "203.0.113.5"): Request =>
  ({ headers: {}, socket: { remoteAddress } }) as unknown as Request;

describe("rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit and blocks beyond it", () => {
    const hits: boolean[] = [];
    for (let i = 0; i < 5; i += 1) {
      hits.push(rateLimitHit("unit:under", 5, 60_000).allowed);
    }
    const blocked = rateLimitHit("unit:under", 5, 60_000);
    expect(hits).toEqual([true, true, true, true, true]);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets the budget after the window elapses", () => {
    rateLimitHit("unit:window", 1, 60_000);
    expect(rateLimitHit("unit:window", 1, 60_000).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimitHit("unit:window", 1, 60_000).allowed).toBe(true);
  });

  it("keeps buckets isolated by key", () => {
    rateLimitHit("unit:key:one", 1, 60_000);
    expect(rateLimitHit("unit:key:two", 1, 60_000).allowed).toBe(true);
  });

  it("prefers the first x-forwarded-for value when present", () => {
    const req = {
      headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
      socket: {},
    } as unknown as Request;
    expect(clientIpOf(req)).toBe("198.51.100.7");
  });

  it("falls back to the socket address when no header is present", () => {
    expect(clientIpOf(makeReq("192.0.2.10"))).toBe("192.0.2.10");
    expect(clientIpOf({ headers: {} } as unknown as Request)).toBe("unknown");
  });

  it("throws a TOO_MANY_REQUESTS tRPC error from enforceRateLimit", () => {
    expect(() => enforceRateLimit(makeReq(), "unit:enforce", 1, 10_000)).not.toThrow();
    try {
      enforceRateLimit(makeReq(), "unit:enforce", 1, 10_000);
      expect.unreachable("expected a rate-limit rejection");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("TOO_MANY_REQUESTS");
    }
  });

  it("clears a bucket so the budget resets early, e.g. after a successful login", () => {
    expect(() => enforceRateLimit(makeReq(), "unit:clear", 1, 60_000)).not.toThrow();
    expect(() => enforceRateLimit(makeReq(), "unit:clear", 1, 60_000)).toThrow();
    clearRateLimit(makeReq(), "unit:clear");
    expect(() => enforceRateLimit(makeReq(), "unit:clear", 1, 60_000)).not.toThrow();
  });
});