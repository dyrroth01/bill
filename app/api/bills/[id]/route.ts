import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, parseDraft, draftTotals, upsertClient, validateDraftFields, toUtcDate } from "@/lib/api";
import { createTemplateSnapshot } from "@/lib/render-bill";

async function getBill(userId: string, id: string) {
  return db.bill.findFirst({ where: { id, userId } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const bill = await getBill(user.id, id);
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    return NextResponse.json({ bill });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getBill(user.id, id);
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    const body = await req.json();

    // Status, payment or installment update — no full draft needed.
    if (!body.draft && !body.items && (body.status || body.action || body.installment || body.paidAmount !== undefined)) {
      const existingPayments: Array<{
        id: string;
        amount: number;
        date: string;
        paymentMode: string;
        chequeNo?: string;
        chequeStatus?: string;
        notes?: string;
        createdAt?: string;
      }> = JSON.parse(existing.payments || "[]");

      const todayStr = new Date().toISOString().slice(0, 10);

      // Action 1: Delete a specific installment
      if (body.action === "DELETE_INSTALLMENT" && body.paymentId) {
        const updatedPayments = existingPayments.filter((p) => p.id !== body.paymentId);
        const newPaidAmount = Math.round(updatedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
        const newStatus = newPaidAmount >= existing.total ? "PAID" : newPaidAmount > 0 ? "PARTIAL" : "PENDING";
        const bill = await db.bill.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            paidAmount: newPaidAmount,
            payments: JSON.stringify(updatedPayments),
            paidAt: newPaidAmount > 0 ? existing.paidAt || new Date() : null,
          },
        });
        return NextResponse.json({ ok: true, id: bill.id, status: newStatus, paidAmount: newPaidAmount });
      }

      // Action 2: Reset all payments to unpaid
      if (body.action === "RESET" || (body.status === "PENDING" && !body.installment && body.paidAmount === undefined)) {
        const bill = await db.bill.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            paidAmount: 0,
            payments: "[]",
            paymentMode: null,
            chequeNo: null,
            chequeStatus: null,
            paidAt: null,
          },
        });
        return NextResponse.json({ ok: true, id: bill.id, status: "PENDING", paidAmount: 0 });
      }

      // Action 3: Record an installment / partial payment
      if (body.action === "INSTALLMENT" || body.installment || body.status === "PARTIAL") {
        const inst = body.installment || {};
        const installmentAmount = Math.round(Number(inst.amount ?? body.paidAmount ?? 0) * 100) / 100;
        if (installmentAmount <= 0) {
          return NextResponse.json({ error: "Installment amount must be greater than 0" }, { status: 400 });
        }

        const mode = inst.paymentMode || body.paymentMode || "CASH";
        const newEntry = {
          id: Math.random().toString(36).slice(2, 10),
          amount: installmentAmount,
          date: inst.date || body.paymentDate || todayStr,
          paymentMode: mode,
          chequeNo: mode === "CHEQUE" ? inst.chequeNo || body.chequeNo || "" : undefined,
          chequeStatus: mode === "CHEQUE" ? inst.chequeStatus || body.chequeStatus || "PENDING" : undefined,
          notes: inst.notes || body.notes || "",
          createdAt: new Date().toISOString(),
        };

        const updatedPayments = [...existingPayments, newEntry];
        const newPaidAmount = Math.round(updatedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
        const newStatus = newPaidAmount >= existing.total ? "PAID" : "PARTIAL";

        const bill = await db.bill.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            paidAmount: newPaidAmount,
            payments: JSON.stringify(updatedPayments),
            paymentMode: mode,
            chequeNo: mode === "CHEQUE" ? newEntry.chequeNo || null : existing.chequeNo,
            chequeStatus: mode === "CHEQUE" ? newEntry.chequeStatus || null : existing.chequeStatus,
            paidAt: existing.paidAt || new Date(),
          },
        });
        return NextResponse.json({
          ok: true,
          id: bill.id,
          status: newStatus,
          paidAmount: newPaidAmount,
          pendingAmount: Math.max(0, existing.total - newPaidAmount),
        });
      }

      // Action 4: Full Payment (Mark as PAID)
      if (body.status === "PAID") {
        const alreadyPaid = existing.paidAmount > 0 ? existing.paidAmount : 0;
        const remaining = Math.max(0, Math.round((existing.total - alreadyPaid) * 100) / 100);
        const mode = body.paymentMode || existing.paymentMode || "CASH";

        let updatedPayments = [...existingPayments];
        if (remaining > 0) {
          updatedPayments.push({
            id: Math.random().toString(36).slice(2, 10),
            amount: remaining,
            date: body.paymentDate || todayStr,
            paymentMode: mode,
            chequeNo: mode === "CHEQUE" ? body.chequeNo || "" : undefined,
            chequeStatus: mode === "CHEQUE" ? body.chequeStatus || "PENDING" : undefined,
            notes: body.notes || (alreadyPaid > 0 ? "Final balance settlement" : "Full payment"),
            createdAt: new Date().toISOString(),
          });
        }

        const bill = await db.bill.update({
          where: { id: existing.id },
          data: {
            status: "PAID",
            paidAmount: existing.total,
            payments: JSON.stringify(updatedPayments),
            paymentMode: mode,
            chequeNo: mode === "CHEQUE" ? body.chequeNo || existing.chequeNo : null,
            chequeStatus: mode === "CHEQUE" ? body.chequeStatus || "PENDING" : null,
            paidAt: existing.paidAt || new Date(),
          },
        });
        return NextResponse.json({ ok: true, id: bill.id, status: "PAID", paidAmount: existing.total, pendingAmount: 0 });
      }
    }

    const draft = parseDraft(body.draft || body);
    const validation = validateDraftFields(draft);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Please fix validation errors", fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const totals = draftTotals(draft);
    const clientId = await upsertClient(user.id, draft);
    const billDate = toUtcDate(draft.billDate) || existing.billDate;
    const dueDate = toUtcDate(draft.dueDate);

    // Calculate status and paidAmount for draft update
    let newPaidAmount = existing.paidAmount;
    let newStatus = existing.status;
    let paymentsStr = existing.payments;

    if (body.status === "PAID") {
      newStatus = "PAID";
      newPaidAmount = totals.total;
    } else if (body.status === "PARTIAL" || (body.paidAmount !== undefined && Number(body.paidAmount) > 0)) {
      newPaidAmount = Math.min(totals.total, Math.max(0, Number(body.paidAmount || draft.paidAmount || existing.paidAmount)));
      newStatus = newPaidAmount >= totals.total ? "PAID" : newPaidAmount > 0 ? "PARTIAL" : "PENDING";
    } else if (body.status === "PENDING") {
      newStatus = "PENDING";
      newPaidAmount = 0;
      paymentsStr = "[]";
    }

    const isPaid = newStatus === "PAID";
    const paymentMode = isPaid || newStatus === "PARTIAL" ? body.paymentMode || draft.paymentMode || existing.paymentMode : null;

    const targetTemplateId = body.templateId !== undefined ? body.templateId || null : existing.templateId;
    let templateSnapshot = existing.templateSnapshot;
    // Refresh snapshot if template changed or was missing
    if (targetTemplateId && (!existing.templateSnapshot || body.templateId !== undefined && body.templateId !== existing.templateId)) {
      templateSnapshot = await createTemplateSnapshot(user.id, targetTemplateId, user);
    }

    const bill = await db.bill.update({
      where: { id: existing.id },
      data: {
        templateId: targetTemplateId,
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
        paidAmount: newPaidAmount,
        payments: paymentsStr,
        amountInWords: totals.words,
        notes: draft.notes || null,
        status: newStatus,
        paymentMode,
        chequeNo: paymentMode === "CHEQUE" ? draft.chequeNo || body.chequeNo || existing.chequeNo : null,
        chequeStatus: paymentMode === "CHEQUE" ? body.chequeStatus || existing.chequeStatus || "PENDING" : null,
        paidAt: newPaidAmount > 0 ? existing.paidAt || new Date() : null,
      },
    });

    return NextResponse.json({ ok: true, id: bill.id });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getBill(user.id, id);
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    await db.bill.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
