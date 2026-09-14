import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { generateVerificationCode, sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const businessName = String(body.businessName || "").trim();

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    if (password.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerified) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please log in." },
          { status: 400 }
        );
      }

      // Do NOT overwrite password hash or credentials of an unverified account.
      // Resend a fresh verification code to the legitimate email address.
      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.verificationCode.deleteMany({ where: { email } });
      await db.verificationCode.create({
        data: { email, code, expiresAt },
      });

      await sendVerificationEmail(email, code);

      return NextResponse.json({
        ok: true,
        requiresVerification: true,
        email,
      });
    }

    const passwordHash = await hashPassword(password);

    await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        businessName: businessName || null,
        emailVerified: false,
      },
    });

    // Generate 6-digit code (valid for 10 minutes)
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Remove any previous codes for this email and save the new one
    await db.verificationCode.deleteMany({ where: { email } });
    await db.verificationCode.create({
      data: { email, code, expiresAt },
    });

    // Dispatch verification email
    await sendVerificationEmail(email, code);

    return NextResponse.json({
      ok: true,
      requiresVerification: true,
      email,
    });
  } catch (e) {
    return apiError(e);
  }
}
