import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse } from "cookie";
import { jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../db";
import { sdk } from "./sdk";

export type TrpcContext = { req: CreateExpressContextOptions["req"]; res: CreateExpressContextOptions["res"]; user: User | null };

export async function authenticateRequest(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  let user: User | null = null;
  const localSessionToken = parse(req.headers.cookie ?? "").likas_session;
  if (localSessionToken && process.env.JWT_SECRET) {
    try {
      const verified = await jwtVerify(localSessionToken, new TextEncoder().encode(process.env.JWT_SECRET));
      const userId = Number(verified.payload.sub);
      if (Number.isInteger(userId)) user = (await getUserById(userId)) ?? null;
    } catch {
      user = null;
    }
  }
  if (!user && !localSessionToken) {
    try { user = await sdk.authenticateRequest(req); } catch { user = null; }
  }
  return user;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  return { req: opts.req, res: opts.res, user: await authenticateRequest(opts.req) };
}
