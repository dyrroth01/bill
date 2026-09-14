import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyBillPdfToken } from "@/lib/share-token";
import { renderBillPdfBuffer } from "@/lib/render-bill";
import { readUpload } from "@/lib/assets";
import type { SellerProfile } from "@/lib/context";

/** Public, token-signed PDF serving for the mobile app (no session needed, rendered on-demand). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id") || "";
  const exp = Number(sp.get("exp"));
  const sig = sp.get("sig") || "";
  if (!id || !verifyBillPdfToken(id, exp, sig)) {
    return NextResponse.json({ error: "Link expired or invalid — refresh it from the app" }, { status: 403 });
  }

  const bill = await db.bill.findUnique({ where: { id } });
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const owner = await db.user.findUnique({ where: { id: bill.userId } });
  if (!owner) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  let bytes: Buffer | null = null;
  if (bill.pdfPath) {
    try {
      bytes = await readUpload(bill.pdfPath);
    } catch {
      bytes = null;
    }
  }
  if (!bytes) {
    const rendered = await renderBillPdfBuffer(owner as unknown as SellerProfile & { id: string }, bill);
    if (rendered) {
      bytes = rendered.bytes;
    }
  }
  if (!bytes) return NextResponse.json({ error: "Could not generate PDF" }, { status: 500 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bill-${bill.billNo.replace(/[^\w.-]/g, "_")}.pdf"`,
    },
  });
}
