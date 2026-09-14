import { NextRequest, NextResponse } from "next/server";
import { requireUser, verifyPassword, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireUser();
    const body = await req.json();

    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");

    // Fetch fresh user record with passwordHash
    const user = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, passwordHash: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If user already has a password, currentPassword must be verified
    if (user.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }
      const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New password and confirmation do not match" },
        { status: 400 }
      );
    }

    // Hash and update password
    const newPasswordHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    return NextResponse.json({
      ok: true,
      message: user.passwordHash
        ? "Password changed successfully."
        : "Password set successfully. You can now log in with email and password.",
    });
  } catch (error) {
    return apiError(error);
  }
}
