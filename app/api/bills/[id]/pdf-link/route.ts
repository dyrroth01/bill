import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { signBillPdfToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

/** GET = a signed URL that opens this bill's PDF without a session for sharing or mobile app. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const bill = await db.bill.findFirst({
      where: { id, userId: user.id },
      include: { client: true },
    });
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    const isShort = req.nextUrl.searchParams.get("short") === "1";
    const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
    const exp = isShort ? Date.now() + 15 * 60 * 1000 : Date.now() + days * 24 * 60 * 60 * 1000;
    const sig = signBillPdfToken(bill.id, exp);
    const origin = req.nextUrl.origin;

    return NextResponse.json({
      url: `${origin}/api/public/bill-pdf?id=${bill.id}&exp=${exp}&sig=${sig}`,
      billNo: bill.billNo,
      clientName: bill.clientName,
      clientEmail: bill.client?.email || null,
      clientPhone: bill.client?.phone || null,
      total: bill.total,
      paidAmount: bill.paidAmount,
      status: bill.status,
      businessName: user.businessName || user.name,
      expiresAt: new Date(exp).toISOString(),
    });
  } catch (e) {
    return apiError(e);
  }
}
