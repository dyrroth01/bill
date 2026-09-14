import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { renderBillPdfBuffer, getBillHtmlForRender } from "@/lib/render-bill";
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

    if (bytes) {
      const download = req.nextUrl.searchParams.get("download") === "1";
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="bill-${bill.billNo.replace(/[^\w.-]/g, "_")}.pdf"`,
        },
      });
    }

    // Graceful fallback for serverless environments
    const htmlRender = await getBillHtmlForRender(user, bill);
    if (htmlRender) {
      const topBar = `
<div id="billflow-action-bar" style="position: sticky; top: 0; left: 0; right: 0; z-index: 9999; background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-family: system-ui, -apple-system, sans-serif;">
  <div style="font-weight: 700; font-size: 14px; color: #1e293b;">Invoice #${bill.billNo}</div>
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
      let printableHtml = htmlRender.html;
      if (/<body[^>]*>/i.test(printableHtml)) {
        printableHtml = printableHtml.replace(/(<body[^>]*>)/i, `$1\n${topBar}`);
      } else {
        printableHtml = topBar + printableHtml;
      }
      return new NextResponse(printableHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    return NextResponse.json({ error: "Could not generate PDF for this bill" }, { status: 500 });
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
