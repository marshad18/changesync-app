import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getUserById, getUserByOpenId } from "../db";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
    const sessionCookie = cookies[COOKIE_NAME];
    const session = await sdk.verifySession(sessionCookie);

    if (session) {
      // Email/password session: openId is "email:{userId}"
      if (session.openId.startsWith("email:")) {
        const userId = parseInt(session.openId.slice(6), 10);
        if (!isNaN(userId)) {
          user = (await getUserById(userId)) ?? null;
        }
      } else {
        // Legacy Manus OAuth session
        user = (await getUserByOpenId(session.openId)) ?? null;
      }
    }
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
