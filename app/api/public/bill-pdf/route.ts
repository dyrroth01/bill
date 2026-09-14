import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyBillPdfToken } from "@/lib/share-token";
import { renderBillPdfBuffer, getBillHtmlForRender } from "@/lib/render-bill";
import { readUpload } from "@/lib/assets";
import type { SellerProfile } from "@/lib/context";

function injectPrintControls(html: string, billNo: string): string {
  const topBar = `
<div id="billflow-action-bar" style="position: sticky; top: 0; left: 0; right: 0; z-index: 9999; background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-family: system-ui, -apple-system, sans-serif;">
  <div style="font-weight: 700; font-size: 14px; color: #1e293b;">Invoice #${billNo}</div>
  <div style="display: flex; gap: 8px;">
    <button onclick="window.print()" style="background: #4f46e5; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
      Print / Save as PDF
    </button>
  </div>
</div>
<style>
@media print {
  #billflow-action-bar { display: none !important; }
}
</style>
`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1\n${topBar}`);
  }
  return topBar + html;
}

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

  if (bytes) {
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bill-${bill.billNo.replace(/[^\w.-]/g, "_")}.pdf"`,
      },
    });
  }

  // Graceful fallback for serverless environments (e.g. Vercel) where headless Chromium might fail
  const htmlRender = await getBillHtmlForRender(owner as unknown as SellerProfile & { id: string }, bill);
  if (htmlRender) {
    const printableHtml = injectPrintControls(htmlRender.html, bill.billNo);
    return new NextResponse(printableHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }

  return NextResponse.json({ error: "Could not generate PDF" }, { status: 500 });
}
