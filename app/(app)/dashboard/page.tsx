import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  effectiveStatus,
  computeBillBalance,
  getBillPaymentsList,
  monthKey,
  monthLabel,
  type BillStatus,
} from "@/lib/bills";
import DashboardCharts from "@/components/DashboardCharts";
import BillRowActions from "@/components/BillRowActions";
import AdBanner from "@/components/AdBanner";
import { IndianRupee, TrendingUp, Clock, AlertTriangle, Plus, Layers } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10).split("-").reverse().join("-") : "—";
}

function StatusBadge({ status }: { status: BillStatus }) {
  const cls: Record<BillStatus, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PARTIAL: "bg-blue-50 text-blue-700 border-blue-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    OVERDUE: "bg-red-50 text-red-600 border-red-200",
  };
  const labels: Record<BillStatus, string> = {
    PAID: "PAID",
    PARTIAL: "PARTIALLY PAID",
    PENDING: "PENDING",
    OVERDUE: "OVERDUE",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls[status]}`}>
      {labels[status]}
    </span>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const bills = await db.bill.findMany({
    where: { userId: user.id },
    orderBy: [{ billDate: "desc" }],
    include: { template: { select: { name: true } } },
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
  const sumPaid = (arr: typeof withStatus) => arr.reduce((s, b) => s + b.paidAmt, 0);

  const paid = withStatus.filter((b) => b.computedStatus === "PAID");
  const partial = withStatus.filter((b) => b.computedStatus === "PARTIAL");
  const pending = withStatus.filter((b) => b.computedStatus === "PENDING");
  const overdue = withStatus.filter((b) => b.computedStatus === "OVERDUE");

  // Outstanding accounts for unpaid balance of all pending, partial, and overdue bills
  const unpaidBills = withStatus.filter((b) => b.pendingAmt > 0);
  const totalOutstanding = sumPending(unpaidBills);

  // Extract all payment installments to accurately calculate cash received by date
  const allPayments = withStatus.flatMap((b) => getBillPaymentsList(b));
  const now = new Date();
  const thisMonth = monthKey(now);
  const thisMonthPayments = allPayments.filter((p) => monthKey(p.date) === thisMonth);
  const collectedThisMonth = thisMonthPayments.reduce((s, p) => s + p.amount, 0);
  const paymentsCountThisMonth = thisMonthPayments.length;

  // last 6 months billed vs received
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const trend = months.map((m) => ({
    month: monthLabel(m),
    Billed: Math.round(sumTotal(withStatus.filter((b) => monthKey(b.billDate) === m))),
    Received: Math.round(allPayments.filter((p) => monthKey(p.date) === m).reduce((s, p) => s + p.amount, 0)),
  }));

  const donut = [
    { name: "Paid", value: paid.length, color: "#10b981" },
    { name: "Partially Paid", value: partial.length, color: "#3b82f6" },
    { name: "Pending", value: pending.length, color: "#f59e0b" },
    { name: "Overdue", value: overdue.length, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const cards = [
    {
      label: "Outstanding (pending + overdue)",
      value: `₹${totalOutstanding.toFixed(0)}`,
      sub:
        unpaidBills.length === 0
          ? "All bills settled"
          : partial.length > 0
            ? `${unpaidBills.length} bills unpaid (${partial.length} partial)`
            : `${unpaidBills.length} bills unpaid`,
      icon: IndianRupee,
      cls: "text-indigo-600 bg-indigo-50",
      href: "/bills",
    },
    {
      label: "Collected this month",
      value: `₹${collectedThisMonth.toFixed(0)}`,
      sub: `${paymentsCountThisMonth} ${paymentsCountThisMonth === 1 ? "payment" : "payments"}`,
      icon: TrendingUp,
      cls: "text-emerald-600 bg-emerald-50",
      href: "/bills?status=PAID",
    },
    {
      label: "Pending",
      value: `${pending.length}`,
      sub: `₹${sumPending(pending).toFixed(0)} awaiting`,
      icon: Clock,
      cls: "text-amber-600 bg-amber-50",
      href: "/bills?status=PENDING",
    },
    {
      label: "Partially Paid",
      value: `${partial.length}`,
      sub:
        partial.length > 0
          ? `₹${sumPending(partial).toFixed(0)} awaiting · ₹${sumPaid(partial).toFixed(0)} paid`
          : `₹0 awaiting`,
      icon: Layers,
      cls: "text-blue-600 bg-blue-50",
      href: "/bills?status=PARTIAL",
    },
    {
      label: "Overdue",
      value: `${overdue.length}`,
      sub: `₹${sumPending(overdue).toFixed(0)} past due date`,
      icon: AlertTriangle,
      cls: "text-red-600 bg-red-50",
      href: "/bills?status=OVERDUE",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {user.businessName ? `${user.businessName}` : `Hello, ${user.name.split(" ")[0]}`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Your billing at a glance.</p>
        </div>
        <Link href="/bills/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New bill
        </Link>
      </div>

      {user.plan !== "pro" && <AdBanner className="mt-5" showAds={true} />}

      {/* stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="card p-5 transition hover:border-indigo-200 hover:shadow-sm block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{c.label}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.cls}`}>
                <c.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">{c.value}</div>
            <div className="mt-0.5 text-xs text-slate-400">{c.sub}</div>
          </Link>
        ))}
      </div>

      {/* charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 text-sm font-bold text-slate-900">Billed vs received — last 6 months</div>
          <DashboardCharts trend={trend} donut={donut} />
        </div>
        <div className="card p-5">
          <div className="mb-4 text-sm font-bold text-slate-900">Bill status</div>
          <DashboardCharts trend={[]} donut={donut} donutOnly />
        </div>
      </div>

      {/* overdue + recent */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Overdue bills
            </span>
            <Link href="/bills?status=overdue" className="text-xs font-semibold text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          {overdue.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nothing overdue 🎉</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {overdue.slice(0, 5).map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link href={`/bills/${b.id}`} className="text-sm font-bold text-indigo-600 hover:underline">
                      #{b.billNo}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {b.clientName} · due {fmtDate(b.dueDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {b.paidAmt > 0 ? (
                      <div className="text-right">
                        <span className="text-sm font-bold text-red-600">₹{b.pendingAmt.toFixed(0)}</span>
                        <div className="text-[10px] text-slate-400">due of ₹{b.total.toFixed(0)}</div>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-slate-900">₹{b.total.toFixed(0)}</span>
                    )}
                    <BillRowActions
                      bill={{
                        id: b.id,
                        billNo: b.billNo,
                        status: b.computedStatus,
                        total: b.total,
                        paidAmount: b.paidAmount,
                        payments: b.payments,
                      }}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">Recent bills</span>
            <Link href="/bills" className="text-xs font-semibold text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          {withStatus.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No bills yet — create your first one.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {withStatus.slice(0, 5).map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link href={`/bills/${b.id}`} className="text-sm font-bold text-indigo-600 hover:underline">
                      #{b.billNo}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {b.clientName} · {fmtDate(b.billDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={b.computedStatus} />
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-900">₹{b.total.toFixed(0)}</span>
                      {b.computedStatus === "PARTIAL" && (
                        <div className="text-[10px] space-x-1">
                          <span className="text-emerald-600 font-medium">₹{b.paidAmt.toFixed(0)} paid</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-amber-600 font-semibold">₹{b.pendingAmt.toFixed(0)} due</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

