import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { renderBillPdfBuffer } from "@/lib/render-bill";
import { readUpload } from "@/lib/assets";
import { signBillPdfToken } from "@/lib/share-token";
import { sendBillEmailWithPdf } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();
    const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase();

    if (!recipientEmail || !recipientEmail.includes("@")) {
      return NextResponse.json({ error: "A valid recipient email is required" }, { status: 400 });
    }

    const bill = await db.bill.findFirst({
      where: { id, userId: user.id },
      include: { client: true },
    });
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    // 1. Get PDF bytes
    let bytes: Buffer | null = null;
    if (bill.pdfPath) {
      try {
        bytes = await readUpload(bill.pdfPath);
      } catch {
        bytes = null;
      }
    }
    if (!bytes) {
      const rendered = await renderBillPdfBuffer(user, bill);
      if (rendered) {
        bytes = rendered.bytes;
      }
    }
    if (!bytes) {
      return NextResponse.json({ error: "Failed to generate PDF for attachment" }, { status: 500 });
    }

    // 2. Generate 30-day view link
    const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const sig = signBillPdfToken(bill.id, exp);
    const origin = req.nextUrl.origin;
    const pdfUrl = `${origin}/api/public/bill-pdf?id=${bill.id}&exp=${exp}&sig=${sig}`;

    // 3. Send email with PDF attachment
    const result = await sendBillEmailWithPdf({
      to: recipientEmail,
      billNo: bill.billNo,
      clientName: bill.clientName || "Valued Customer",
      businessName: user.businessName || user.name,
      total: bill.total,
      pdfBuffer: bytes,
      pdfUrl,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.message || "Could not dispatch email" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `Invoice PDF successfully sent to ${recipientEmail}`,
    });
  } catch (e) {
    return apiError(e);
  }
}
