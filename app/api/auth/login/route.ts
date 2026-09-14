import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// In-memory rate limiting and account brute-force protection
const ipLoginAttempts = new Map<string, { count: number; windowStart: number }>();
const accountLoginAttempts = new Map<string, { count: number; lockedUntil?: number }>();

const MAX_IP_LOGIN_PER_MINUTE = 10;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const now = Date.now();

    // 1. IP rate limiting
    const ipRecord = ipLoginAttempts.get(ip);
    if (ipRecord && now - ipRecord.windowStart < 60000) {
      if (ipRecord.count >= MAX_IP_LOGIN_PER_MINUTE) {
        return NextResponse.json(
          { error: "Too many login attempts from this IP. Please wait a minute." },
          { status: 429 }
        );
      }
      ipRecord.count++;
    } else {
      ipLoginAttempts.set(ip, { count: 1, windowStart: now });
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // 2. Account lockout check
    const accountRecord = accountLoginAttempts.get(email);
    if (accountRecord?.lockedUntil && accountRecord.lockedUntil > now) {
      const waitMinutes = Math.ceil((accountRecord.lockedUntil - now) / 60000);
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Account login is temporarily locked for ${waitMinutes} minute(s).`,
        },
        { status: 429 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return recordLoginFailure(email);
    }
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "This account was created with Google. Please sign in using Google." },
        { status: 400 }
      );
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return recordLoginFailure(email);
    }

    // Success — clear failed attempts
    accountLoginAttempts.delete(email);

    await setSessionCookie(user.id);
    return NextResponse.json({ ok: true, onboardingDone: user.onboardingDone });
  } catch (e) {
    return apiError(e);
  }
}

function recordLoginFailure(email: string): NextResponse {
  const now = Date.now();
  const current = accountLoginAttempts.get(email);
  const failures = (current?.count || 0) + 1;

  if (failures >= MAX_FAILED_LOGIN_ATTEMPTS) {
    accountLoginAttempts.set(email, { count: failures, lockedUntil: now + LOGIN_LOCKOUT_MS });
    return NextResponse.json(
      {
        error: "Too many failed login attempts. Account login is locked for 15 minutes.",
      },
      { status: 429 }
    );
  }

  accountLoginAttempts.set(email, { count: failures });
  const remaining = MAX_FAILED_LOGIN_ATTEMPTS - failures;
  return NextResponse.json(
    { error: `Invalid email or password. (${remaining} attempt${remaining === 1 ? "" : "s"} remaining)` },
    { status: 400 }
  );
}
