import { TRPCError } from "@trpc/server";
import type { Request } from "express";

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Good enough for single-instance deployments and for stopping casual
 * brute force / abuse. If the app ever runs on multiple instances behind a
 * load balancer, replace this with a shared store (e.g. Redis) — the call
 * sites only depend on the functions exported here.
 *
 * NOTE: the client IP prefers `x-forwarded-for` for the first value. When the
 * app sits behind a trusted proxy (Railway, nginx) this is correct; if the app
 * is ever exposed directly, prefer `req.socket.remoteAddress`.
 */

const DEFAULT_WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, number[]>();

export function clientIpOf(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? "unknown";
}

export function rateLimitHit(
  key: string,
  limit: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let hits = buckets.get(key) ?? [];
  hits = hits.filter(timestamp => timestamp > now - windowMs);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    const retryAfterMs = Math.max(1, windowMs - (now - hits[0]));
    return { allowed: false, retryAfterMs };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > MAX_BUCKETS) {
    buckets.forEach((timestamps, candidate) => {
      if (
        timestamps.length === 0 ||
        timestamps[timestamps.length - 1] <= now - windowMs
      ) {
        buckets.delete(candidate);
      }
    });
  }

  return { allowed: true, retryAfterMs: 0 };
}

/** Drop the sliding window for an IP+key pair, e.g. after a successful login. */
export function clearRateLimit(req: Request, key: string): void {
  buckets.delete(`${clientIpOf(req)}:${key}`);
}

/** Throw a tRPC TOO_MANY_REQUESTS when an IP+key pair exceeds its budget. */
export function enforceRateLimit(
  req: Request,
  key: string,
  limit: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const { allowed, retryAfterMs } = rateLimitHit(
    `${clientIpOf(req)}:${key}`,
    limit,
    windowMs,
  );
  if (!allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many attempts. Please try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
    });
  }
}