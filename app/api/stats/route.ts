import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { effectiveStatus, computeBillBalance, getBillPaymentsList, monthKey, type BillStatus } from "@/lib/bills";

/** Dashboard aggregates for the mobile app. */
export async function GET() {
  try {
    const user = await requireUser();
    const bills = await db.bill.findMany({
      where: { userId: user.id },
      orderBy: [{ billDate: "desc" }],
    });
    const withStatus = bills.map((b) => {
      const computedStatus = effectiveStatus(b) as BillStatus;
      const balance = computeBillBalance(b);
      return {
        ...b,
        computedStatus,
        paidAmt: balance.paidAmount,
        pendingAmt: balance.pendingAmount,
      };
    });

    const sumTotal = (arr: typeof withStatus) => arr.reduce((s, b) => s + b.total, 0);
    const sumPending = (arr: typeof withStatus) => arr.reduce((s, b) => s + b.pendingAmt, 0);

    const paid = withStatus.filter((b) => b.computedStatus === "PAID");
    const partial = withStatus.filter((b) => b.computedStatus === "PARTIAL");
    const pending = withStatus.filter((b) => b.computedStatus === "PENDING");
    const overdue = withStatus.filter((b) => b.computedStatus === "OVERDUE");
    const unpaidBills = withStatus.filter((b) => b.pendingAmt > 0);
    const thisMonth = monthKey(new Date());

    const outstanding = sumPending(unpaidBills);

    const allPayments = withStatus.flatMap((b) => getBillPaymentsList(b));
    const thisMonthPayments = allPayments.filter((p) => monthKey(p.date) === thisMonth);
    const collectedThisMonth = thisMonthPayments.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      outstanding,
      collectedThisMonth,
      counts: {
        paid: paid.length,
        partial: partial.length,
        pending: pending.length,
        overdue: overdue.length,
        unpaid: unpaidBills.length,
        total: bills.length,
      },
      amounts: {
        paid: sumTotal(paid),
        partial: sumPending(partial),
        pending: sumPending(pending),
        overdue: sumPending(overdue),
      },
      recent: withStatus.slice(0, 8).map((b) => {
        return {
          id: b.id,
          billNo: b.billNo,
          clientName: b.clientName,
          total: b.total,
          paidAmount: b.paidAmt,
          pendingAmount: b.pendingAmt,
          status: b.computedStatus,
          billDate: b.billDate,
        };
      }),
    });
  } catch (e) {
    return apiError(e);
  }
}
