import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { renderBillPdfBuffer } from "@/lib/render-bill";
import { readUpload } from "@/lib/assets";

/** GET = serve the bill's PDF rendered in-memory on demand without storing files on disk. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const bill = await db.bill.findFirst({ where: { id, userId: user.id } });
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    let bytes: Buffer | null = null;
    // Check if legacy file exists on disk
    if (bill.pdfPath) {
      try {
        bytes = await readUpload(bill.pdfPath);
      } catch {
        bytes = null;
      }
    }

    // Otherwise render in memory on demand from template snapshot / details
    if (!bytes) {
      const rendered = await renderBillPdfBuffer(user, bill);
      if (rendered) {
        bytes = rendered.bytes;
      }
    }

    if (!bytes) return NextResponse.json({ error: "Could not generate PDF for this bill" }, { status: 500 });

    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="bill-${bill.billNo.replace(/[^\w.-]/g, "_")}.pdf"`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

/** POST = refresh check / test render */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const bill = await db.bill.findFirst({ where: { id, userId: user.id } });
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    const rendered = await renderBillPdfBuffer(user, bill);
    if (!rendered) return NextResponse.json({ error: "Could not render PDF" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
