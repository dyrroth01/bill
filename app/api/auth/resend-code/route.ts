import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { generateVerificationCode, sendVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "No account found with this email" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "Email is already verified. Please log in." }, { status: 400 });
    }

    // Rate limit: prevent requesting more than once every 30 seconds
    const recent = await db.verificationCode.findFirst({
      where: {
        email,
        createdAt: { gt: new Date(Date.now() - 30 * 1000) },
      },
    });

    if (recent) {
      return NextResponse.json(
        { error: "Please wait 30 seconds before requesting another verification code." },
        { status: 429 }
      );
    }

    // Generate fresh code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.verificationCode.deleteMany({ where: { email } });
    await db.verificationCode.create({
      data: { email, code, expiresAt },
    });

    await sendVerificationEmail(email, code);

    return NextResponse.json({
      ok: true,
      message: "A new verification code has been sent.",
    });
  } catch (e) {
    return apiError(e);
  }
}
