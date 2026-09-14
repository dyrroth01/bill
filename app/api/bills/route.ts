import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, parseDraft, draftTotals, upsertClient, validateDraftFields, toUtcDate } from "@/lib/api";
import { effectiveStatus } from "@/lib/bills";
import { createTemplateSnapshot } from "@/lib/render-bill";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") || "all";
    const q = (sp.get("q") || "").trim();
    const templateId = sp.get("templateId") || "";

    const bills = await db.bill.findMany({
      where: {
        userId: user.id,
        ...(templateId ? { templateId } : {}),
        ...(q ? { OR: [{ billNo: { contains: q } }, { clientName: { contains: q } }] } : {}),
      },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      include: { template: { select: { name: true } } },
    });

    const mapped = bills
      .map((b) => ({ ...b, computedStatus: effectiveStatus(b) }))
      .filter((b) => (status === "all" ? true : b.computedStatus === status));

    return NextResponse.json({ bills: mapped });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const draft = parseDraft(body.draft || body);
    const validation = validateDraftFields(draft);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Please fix validation errors", fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    // Freemium / Pro Quota Enforcements (50 bills max for free)
    const isPro = user.plan === "pro";
    if (!isPro) {
      const currentBills = await db.bill.count({ where: { userId: user.id } });
      if (currentBills >= 50) {
        return NextResponse.json(
          {
            error: "Freemium plan limit reached (maximum 50 bills). Upgrade to Pro for $5/month for unlimited bills and zero ads.",
            quotaExceeded: "bills",
          },
          { status: 403 }
        );
      }
    }

    const totals = draftTotals(draft);
    const clientId = await upsertClient(user.id, draft);
    const billDate = toUtcDate(draft.billDate) || new Date();
    const dueDate = toUtcDate(draft.dueDate);

    let paidAmount = 0;
    let status = "PENDING";
    const initialPayments: Array<Record<string, unknown>> = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    if (body.status === "PAID") {
      paidAmount = totals.total;
      status = "PAID";
      initialPayments.push({
        id: Math.random().toString(36).slice(2, 10),
        amount: totals.total,
        date: todayStr,
        paymentMode: body.paymentMode || "CASH",
        chequeNo: body.paymentMode === "CHEQUE" ? draft.chequeNo || body.chequeNo || "" : undefined,
        chequeStatus: body.paymentMode === "CHEQUE" ? body.chequeStatus || "PENDING" : undefined,
        notes: "Full payment on creation",
        createdAt: new Date().toISOString(),
      });
    } else if (body.status === "PARTIAL" || (body.paidAmount !== undefined && Number(body.paidAmount) > 0)) {
      paidAmount = Math.min(totals.total, Math.max(0, Number(body.paidAmount || draft.paidAmount || 0)));
      status = paidAmount >= totals.total ? "PAID" : paidAmount > 0 ? "PARTIAL" : "PENDING";
      if (paidAmount > 0) {
        initialPayments.push({
          id: Math.random().toString(36).slice(2, 10),
          amount: paidAmount,
          date: todayStr,
          paymentMode: body.paymentMode || "CASH",
          chequeNo: body.paymentMode === "CHEQUE" ? draft.chequeNo || body.chequeNo || "" : undefined,
          chequeStatus: body.paymentMode === "CHEQUE" ? body.chequeStatus || "PENDING" : undefined,
          notes: "Initial installment / advance",
          createdAt: new Date().toISOString(),
        });
      }
    }

    const isPaidOrPartial = status === "PAID" || status === "PARTIAL";
    const paymentMode = isPaidOrPartial ? body.paymentMode || null : null;

    // Snapshot the current template & seller profile at creation time
    let templateSnapshot: string | null = null;
    if (body.templateId) {
      templateSnapshot = await createTemplateSnapshot(user.id, body.templateId, user);
    }

    const bill = await db.bill.create({
      data: {
        userId: user.id,
        templateId: body.templateId || null,
        templateSnapshot,
        clientId,
        clientName: draft.client.name,
        billNo: draft.billNo,
        billDate,
        dueDate,
        items: JSON.stringify(draft.items),
        extra: JSON.stringify(draft.extra),
        subtotal: totals.subtotal,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        cgstRate: draft.cgstRate,
        sgstRate: draft.sgstRate,
        igstRate: draft.igstRate,
        total: totals.total,
        paidAmount,
        payments: JSON.stringify(initialPayments),
        amountInWords: totals.words,
        notes: draft.notes || null,
        status,
        paymentMode,
        chequeNo: isPaidOrPartial && paymentMode === "CHEQUE" ? draft.chequeNo || body.chequeNo || null : null,
        chequeStatus: isPaidOrPartial && paymentMode === "CHEQUE" ? body.chequeStatus || "PENDING" : null,
        paidAt: isPaidOrPartial ? new Date() : null,
      },
    });

    return NextResponse.json({ ok: true, id: bill.id });
  } catch (e) {
    return apiError(e);
  }
}
