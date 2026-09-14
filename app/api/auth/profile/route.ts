import { NextRequest, NextResponse } from "next/server";
import { requireUser, clearSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { UPLOAD_ROOT } from "@/lib/assets";
import { rm } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/profile
 * Returns auth & profile security details for the active session user:
 * - hasPassword (boolean)
 * - isGoogleLinked (boolean)
 * - googleId
 * - avatarUrl
 */
export async function GET() {
  try {
    const sessionUser = await requireUser();
    const user = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        passwordHash: true,
        googleId: true,
        avatarUrl: true,
        plan: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        hasPassword: Boolean(user.passwordHash),
        isGoogleLinked: Boolean(user.googleId),
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * DELETE /api/auth/profile
 * Permanently deletes user profile and all associated data:
 * - Deletes user's disk directory uploads/<userId>
 * - Deletes verification codes
 * - Deletes User record from database (cascades to templates, bills, clients, assets)
 * - Clears session cookie
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));

    // Safety confirmation check
    if (body.confirmation !== "DELETE") {
      return NextResponse.json(
        { error: "Confirmation required. Please type DELETE to confirm." },
        { status: 400 }
      );
    }

    const userId = user.id;
    const userEmail = user.email;

    // 1. Delete user files on disk (uploads/<userId>)
    try {
      const userUploadDir = path.join(UPLOAD_ROOT, userId);
      await rm(userUploadDir, { recursive: true, force: true });
    } catch (fsErr) {
      console.error(`Failed to delete upload directory for user ${userId}:`, fsErr);
      // Non-fatal, proceed with database deletion
    }

    // 2. Clean up any verification codes associated with email
    try {
      await db.verificationCode.deleteMany({
        where: { email: userEmail },
      });
    } catch (e) {
      console.warn("Failed to delete verification codes:", e);
    }

    // 3. Delete user in DB (Prisma onDelete: Cascade removes bills, templates, clients, assets)
    await db.user.delete({
      where: { id: userId },
    });

    // 4. Invalidate session cookie
    await clearSessionCookie();

    return NextResponse.json({
      ok: true,
      message: "Profile and all associated data have been permanently deleted.",
    });
  } catch (error) {
    return apiError(error);
  }
}
