import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { effectiveStatus, monthKey, monthLabel, type BillStatus } from "@/lib/bills";
import DashboardCharts from "@/components/DashboardCharts";
import BillRowActions from "@/components/BillRowActions";
import AdBanner from "@/components/AdBanner";
import { IndianRupee, TrendingUp, Clock, AlertTriangle, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10).split("-").reverse().join("-") : "—";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const bills = await db.bill.findMany({
    where: { userId: user.id },
    orderBy: [{ billDate: "desc" }],
    include: { template: { select: { name: true } } },
  });

  const withStatus = bills.map((b) => ({ ...b, computedStatus: effectiveStatus(b) as BillStatus }));
  const sum = (arr: typeof withStatus) => arr.reduce((s, b) => s + b.total, 0);

  const paid = withStatus.filter((b) => b.computedStatus === "PAID");
  const pending = withStatus.filter((b) => b.computedStatus === "PENDING");
  const overdue = withStatus.filter((b) => b.computedStatus === "OVERDUE");

  const now = new Date();
  const thisMonth = monthKey(now);
  const collectedThisMonth = paid
    .filter((b) => b.paidAt && monthKey(b.paidAt) === thisMonth)
    .reduce((s, b) => s + b.total, 0);

  // last 6 months billed vs received
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const trend = months.map((m) => ({
    month: monthLabel(m),
    Billed: Math.round(sum(withStatus.filter((b) => monthKey(b.billDate) === m))),
    Received: Math.round(
      paid.filter((b) => b.paidAt && monthKey(b.paidAt) === m).reduce((s, b) => s + b.total, 0)
    ),
  }));

  const donut = [
    { name: "Paid", value: paid.length, color: "#10b981" },
    { name: "Pending", value: pending.length, color: "#f59e0b" },
    { name: "Overdue", value: overdue.length, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const cards = [
    {
      label: "Outstanding (pending + overdue)",
      value: `₹${(sum(pending) + sum(overdue)).toFixed(0)}`,
      sub: `${pending.length + overdue.length} bills unpaid`,
      icon: IndianRupee,
      cls: "text-indigo-600 bg-indigo-50",
    },
    {
      label: "Collected this month",
      value: `₹${collectedThisMonth.toFixed(0)}`,
      sub: `${paid.filter((b) => b.paidAt && monthKey(b.paidAt) === thisMonth).length} payments`,
      icon: TrendingUp,
      cls: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Pending",
      value: `${pending.length}`,
      sub: `₹${sum(pending).toFixed(0)} awaiting`,
      icon: Clock,
      cls: "text-amber-600 bg-amber-50",
    },
    {
      label: "Overdue",
      value: `${overdue.length}`,
      sub: `₹${sum(overdue).toFixed(0)} past due date`,
      icon: AlertTriangle,
      cls: "text-red-600 bg-red-50",
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
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{c.label}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.cls}`}>
                <c.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">{c.value}</div>
            <div className="mt-0.5 text-xs text-slate-400">{c.sub}</div>
          </div>
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
                    <span className="text-sm font-bold text-slate-900">₹{b.total.toFixed(0)}</span>
                    <BillRowActions bill={{ id: b.id, billNo: b.billNo, status: "OVERDUE", total: b.total }} compact />
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
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        b.computedStatus === "PAID"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : b.computedStatus === "PENDING"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-red-200 bg-red-50 text-red-600"
                      }`}
                    >
                      {b.computedStatus}
                    </span>
                    <span className="text-sm font-bold text-slate-900">₹{b.total.toFixed(0)}</span>
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
