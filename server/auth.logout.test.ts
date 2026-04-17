import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByEmail: vi.fn(),
    createEmailUser: vi.fn(),
    updateUserPasswordHash: vi.fn(),
    setPasswordResetToken: vi.fn(),
    getUserByResetToken: vi.fn(),
    updateUserLastSignedIn: vi.fn(),
  };
});

import {
  getUserByEmail,
  createEmailUser,
  updateUserPasswordHash,
  setPasswordResetToken,
  getUserByResetToken,
  updateUserLastSignedIn,
} from "./db";

// ─── Context helpers ──────────────────────────────────────────────────────────
type CookieCall = { name: string; value?: string; options: Record<string, unknown> };
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext() {
  const cookies: CookieCall[] = [];
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, cookies, clearedCookies };
}

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    passwordHash: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
    loginMethod: "email_password",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

const MOCK_USER: AuthenticatedUser = {
  id: 42,
  openId: null,
  email: "test@example.com",
  name: "Test User",
  passwordHash: null,
  passwordResetToken: null,
  passwordResetExpiry: null,
  loginMethod: "email_password",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1, secure: true, sameSite: "none", httpOnly: true, path: "/",
    });
  });
});

describe("auth.register", () => {
  beforeEach(() => {
    vi.mocked(getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(createEmailUser).mockResolvedValue({ ...MOCK_USER, passwordHash: "hashed" });
  });

  it("creates a new user and sets a session cookie", async () => {
    const { ctx, cookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.register({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
    expect(result.user.email).toBe("test@example.com");
    expect(cookies.some((c) => c.name === COOKIE_NAME)).toBe(true);
  });

  it("throws if email already exists", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ ...MOCK_USER, passwordHash: "hashed" });
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.register({ name: "Test", email: "test@example.com", password: "password123" })
    ).rejects.toThrow("An account with this email already exists.");
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.register({ name: "Test", email: "test@example.com", password: "short" })
    ).rejects.toThrow();
  });
});

describe("auth.login", () => {
  it("rejects unknown email", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(undefined);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ email: "nobody@example.com", password: "password123" })
    ).rejects.toThrow("Invalid email or password.");
  });

  it("rejects wrong password", async () => {
    // Return a user with a bcrypt hash of "correctpassword"
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correctpassword", 10);
    vi.mocked(getUserByEmail).mockResolvedValue({ ...MOCK_USER, passwordHash: hash });
    vi.mocked(updateUserLastSignedIn).mockResolvedValue(undefined);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.login({ email: "test@example.com", password: "wrongpassword" })
    ).rejects.toThrow("Invalid email or password.");
  });
});

describe("auth.forgotPassword", () => {
  it("returns success even for unknown email (prevents enumeration)", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(undefined);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.forgotPassword({ email: "nobody@example.com" });
    expect(result.success).toBe(true);
    expect(setPasswordResetToken).not.toHaveBeenCalled();
  });

  it("sets a reset token for a known user", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ ...MOCK_USER, passwordHash: "hashed" });
    vi.mocked(setPasswordResetToken).mockResolvedValue(undefined);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.forgotPassword({ email: "test@example.com" });
    expect(result.success).toBe(true);
    expect(setPasswordResetToken).toHaveBeenCalledWith(
      MOCK_USER.id,
      expect.any(String),
      expect.any(Date)
    );
  });
});

describe("auth.resetPassword", () => {
  it("rejects an invalid token", async () => {
    vi.mocked(getUserByResetToken).mockResolvedValue(undefined);
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.resetPassword({ token: "badtoken", password: "newpassword123" })
    ).rejects.toThrow("Invalid or expired reset link.");
  });

  it("rejects an expired token", async () => {
    const expiredDate = new Date(Date.now() - 1000); // 1 second ago
    vi.mocked(getUserByResetToken).mockResolvedValue({
      ...MOCK_USER,
      passwordHash: "hashed",
      passwordResetToken: "validtoken",
      passwordResetExpiry: expiredDate,
    });
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.auth.resetPassword({ token: "validtoken", password: "newpassword123" })
    ).rejects.toThrow("This reset link has expired.");
  });
});
