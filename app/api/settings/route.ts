import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

const ALLOWED = [
  "businessName",
  "businessTagline",
  "businessAddress",
  "businessPhone",
  "businessGstin",
  "bankName",
  "bankAccountNo",
  "bankIfsc",
  "bankUpiId",
] as const;

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const data: Record<string, string | null> = {};
    for (const key of ALLOWED) {
      if (key in body) {
        const v = body[key];
        data[key] = v === null || v === undefined ? null : String(v).trim() || null;
      }
    }
    await db.user.update({ where: { id: user.id }, data });
    const { getUserUsage } = await import("@/lib/quotas");
    const usage = await getUserUsage(user.id);
    return NextResponse.json({
      ok: true,
      aiEnabled: Boolean(process.env.GEMINI_API_KEY),
      usage,
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const { getUserUsage } = await import("@/lib/quotas");
    const usage = await getUserUsage(user.id);
    return NextResponse.json({
      businessName: user.businessName,
      businessTagline: user.businessTagline,
      businessAddress: user.businessAddress,
      businessPhone: user.businessPhone,
      businessGstin: user.businessGstin,
      bankName: user.bankName,
      bankAccountNo: user.bankAccountNo,
      bankIfsc: user.bankIfsc,
      bankUpiId: user.bankUpiId,
      aiEnabled: Boolean(process.env.GEMINI_API_KEY),
      usage,
    });
  } catch (e) {
    return apiError(e);
  }
}
