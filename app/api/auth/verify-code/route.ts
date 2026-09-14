import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { BUILTIN_TEMPLATES } from "@/lib/builtin-templates";

export const dynamic = "force-dynamic";

// In-memory tracking for rate limiting and brute force protection
const ipAttempts = new Map<string, { count: number; windowStart: number }>();
const emailAttempts = new Map<string, { count: number; lockedUntil?: number }>();

const MAX_IP_REQUESTS_PER_MINUTE = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const now = Date.now();

    // 1. IP rate limiting (10 attempts / min)
    const ipRecord = ipAttempts.get(ip);
    if (ipRecord && now - ipRecord.windowStart < 60000) {
      if (ipRecord.count >= MAX_IP_REQUESTS_PER_MINUTE) {
        return NextResponse.json(
          { error: "Too many verification requests from this IP. Please wait a minute." },
          { status: 429 }
        );
      }
      ipRecord.count++;
    } else {
      ipAttempts.set(ip, { count: 1, windowStart: now });
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Please enter a valid 6-digit code" }, { status: 400 });
    }

    // 2. Check if email is currently locked out from brute force attempts
    const emailRecord = emailAttempts.get(email);
    if (emailRecord?.lockedUntil && emailRecord.lockedUntil > now) {
      const waitMinutes = Math.ceil((emailRecord.lockedUntil - now) / 60000);
      return NextResponse.json(
        {
          error: `Too many failed attempts. Verification is locked for ${waitMinutes} minute(s). Please request a new code.`,
        },
        { status: 429 }
      );
    }

    // 3. Verify code against database
    const record = await db.verificationCode.findFirst({
      where: {
        email,
        code,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      const currentFailures = (emailRecord?.count || 0) + 1;
      if (currentFailures >= MAX_FAILED_ATTEMPTS) {
        // Invalidate active codes for this email and lock account verification window
        await db.verificationCode.deleteMany({ where: { email } });
        emailAttempts.set(email, { count: currentFailures, lockedUntil: now + LOCKOUT_DURATION_MS });
        return NextResponse.json(
          {
            error:
              "Too many incorrect verification attempts. This verification code has been invalidated for security. Please request a new code.",
          },
          { status: 429 }
        );
      } else {
        emailAttempts.set(email, { count: currentFailures });
        const remaining = MAX_FAILED_ATTEMPTS - currentFailures;
        return NextResponse.json(
          {
            error: `Invalid or expired verification code. (${remaining} attempt${remaining === 1 ? "" : "s"} remaining)`,
          },
          { status: 400 }
        );
      }
    }

    // Successful match — clear failed attempt counters
    emailAttempts.delete(email);

    // 2. Find and verify the user
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "User account not found. Please sign up again." }, { status: 404 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    // 3. Seed starter templates if this user doesn't have any yet
    const existingTemplates = await db.template.count({ where: { userId: user.id } });
    if (existingTemplates === 0) {
      await db.template.createMany({
        data: BUILTIN_TEMPLATES.map((t) => ({
          userId: user.id,
          name: t.name,
          description: t.description,
          sourceType: "builtin",
          html: t.html,
          fieldSchema: JSON.stringify(t.fields),
          blocks: JSON.stringify(t.blocks),
          pageFormat: t.pageFormat,
        })),
      });
    }

    // 4. Delete used codes for this email
    await db.verificationCode.deleteMany({ where: { email } });

    // 5. Establish session
    await setSessionCookie(user.id);

    return NextResponse.json({
      ok: true,
      userId: user.id,
      onboardingDone: user.onboardingDone,
    });
  } catch (e) {
    return apiError(e);
  }
}
