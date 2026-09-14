import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { effectiveStatus, monthKey, type BillStatus } from "@/lib/bills";

/** Dashboard aggregates for the mobile app. */
export async function GET() {
  try {
    const user = await requireUser();
    const bills = await db.bill.findMany({
      where: { userId: user.id },
      orderBy: [{ billDate: "desc" }],
    });
    const withStatus = bills.map((b) => ({ ...b, computedStatus: effectiveStatus(b) as BillStatus }));
    const sum = (arr: typeof withStatus) => arr.reduce((s, b) => s + b.total, 0);
    const paid = withStatus.filter((b) => b.computedStatus === "PAID");
    const partial = withStatus.filter((b) => b.computedStatus === "PARTIAL");
    const pending = withStatus.filter((b) => b.computedStatus === "PENDING");
    const overdue = withStatus.filter((b) => b.computedStatus === "OVERDUE");
    const thisMonth = monthKey(new Date());

    const outstanding = withStatus.reduce((s, b) => {
      const paidAmt = b.paidAmount > 0 ? b.paidAmount : b.computedStatus === "PAID" ? b.total : 0;
      return s + Math.max(0, b.total - paidAmt);
    }, 0);

    const collectedThisMonth = withStatus.reduce((acc, b) => {
      try {
        const payments = JSON.parse(b.payments || "[]");
        if (Array.isArray(payments) && payments.length > 0) {
          const monthSum = payments
            .filter((p: { date?: string }) => p.date && monthKey(new Date(p.date)) === thisMonth)
            .reduce((s: number, p: { amount?: number }) => s + (Number(p.amount) || 0), 0);
          return acc + monthSum;
        }
      } catch {}
      if (b.paidAt && monthKey(b.paidAt) === thisMonth) {
        return acc + (b.paidAmount > 0 ? b.paidAmount : b.computedStatus === "PAID" ? b.total : 0);
      }
      return acc;
    }, 0);

    return NextResponse.json({
      outstanding,
      collectedThisMonth,
      counts: {
        paid: paid.length,
        partial: partial.length,
        pending: pending.length,
        overdue: overdue.length,
        total: bills.length,
      },
      amounts: { paid: sum(paid), partial: sum(partial), pending: sum(pending), overdue: sum(overdue) },
      recent: withStatus.slice(0, 8).map((b) => {
        const paidAmt = b.paidAmount > 0 ? b.paidAmount : b.computedStatus === "PAID" ? b.total : 0;
        return {
          id: b.id,
          billNo: b.billNo,
          clientName: b.clientName,
          total: b.total,
          paidAmount: paidAmt,
          pendingAmount: Math.max(0, b.total - paidAmt),
          status: b.computedStatus,
          billDate: b.billDate,
        };
      }),
    });
  } catch (e) {
    return apiError(e);
  }
}
