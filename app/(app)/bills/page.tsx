import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { effectiveStatus, type BillStatus } from "@/lib/bills";
import BillRowActions from "@/components/BillRowActions";
import AdBanner from "@/components/AdBanner";
import { Plus, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TABS: { id: "all" | BillStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PENDING", label: "Pending" },
  { id: "PARTIAL", label: "Partially Paid" },
  { id: "PAID", label: "Paid" },
  { id: "OVERDUE", label: "Overdue" },
];

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
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls[status]}`}>{labels[status]}</span>;
}

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const rawStatus = (sp.status || "").toUpperCase();
  const status = (["PAID", "PARTIAL", "PENDING", "OVERDUE"].includes(rawStatus) ? rawStatus : "all") as "all" | BillStatus;
  const q = (sp.q || "").trim();

  const bills = await db.bill.findMany({
    where: {
      userId: user.id,
      ...(q ? { OR: [{ billNo: { contains: q } }, { clientName: { contains: q } }] } : {}),
    },
    orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    include: { template: { select: { name: true } } },
  });
  const mapped = bills
    .map((b) => ({ ...b, computedStatus: effectiveStatus(b) }))
    .filter((b) => (status === "all" ? true : b.computedStatus === status));

  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("-") : "—");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bills</h1>
          <p className="mt-1 text-sm text-slate-500">{bills.length} bills total</p>
        </div>
        <Link href="/bills/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New bill
        </Link>
      </div>

      {user.plan !== "pro" && <AdBanner className="mt-4" showAds={true} />}

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => {
            const count = t.id === "all" ? bills.length : bills.filter((b) => effectiveStatus(b) === t.id).length;
            const active = status === t.id;
            return (
              <Link
                key={t.id}
                href={`/bills?status=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label} ({count})
              </Link>
            );
          })}
        </div>
        <form action="/bills" className="flex w-full sm:w-auto gap-2">
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search bill no. or client…"
            className="field flex-1 sm:!w-60 !py-1.5 text-sm"
          />
          <button className="btn-secondary !py-1.5 text-xs shrink-0">Search</button>
        </form>
      </div>

      {mapped.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {q || status !== "all" ? "No bills match this filter." : "No bills yet — create your first one."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden mt-4 space-y-3">
            {mapped.map((b) => (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <Link href={`/bills/${b.id}`} className="font-bold text-base text-indigo-600 hover:underline">
                      #{b.billNo}
                    </Link>
                    <div className="text-[11px] text-slate-400">{b.template?.name || "no template"}</div>
                  </div>
                  <StatusBadge status={b.computedStatus} />
                </div>

                <div className="mt-2.5 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800 truncate max-w-[200px]">{b.clientName}</span>
                  <span className="font-extrabold text-slate-900 text-base">₹{b.total.toFixed(2)}</span>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Date: {fmt(b.billDate)}</span>
                  <span>Due: {fmt(b.dueDate)}</span>
                </div>

                {b.computedStatus === "PARTIAL" && (
                  <div className="mt-2 rounded-lg bg-blue-50/70 p-2 text-xs flex justify-between">
                    <span className="text-emerald-700 font-medium">Paid: ₹{(b.paidAmount || 0).toFixed(2)}</span>
                    <span className="text-amber-700 font-bold">Pending: ₹{Math.max(0, b.total - (b.paidAmount || 0)).toFixed(2)}</span>
                  </div>
                )}

                {b.paymentMode && (
                  <div className="mt-1.5 text-[11px] text-slate-400">
                    Payment: {b.paymentMode}
                    {b.paymentMode === "CHEQUE" && b.chequeNo ? ` · Chq ${b.chequeNo}` : ""}
                    {b.chequeStatus ? ` (${b.chequeStatus.toLowerCase()})` : ""}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <Link href={`/bills/${b.id}`} className="text-xs font-semibold text-indigo-600 hover:underline">
                    View details →
                  </Link>
                  <BillRowActions
                    bill={{
                      id: b.id,
                      billNo: b.billNo,
                      status: b.computedStatus,
                      chequeNo: b.chequeNo || "",
                      total: b.total,
                      paidAmount: b.paidAmount,
                      payments: b.payments,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block card mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Bill</th>
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Due</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mapped.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <Link href={`/bills/${b.id}`} className="font-bold text-indigo-600 hover:underline">
                        #{b.billNo}
                      </Link>
                      <div className="text-[11px] text-slate-400">{b.template?.name || "no template"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-52 truncate font-medium text-slate-800">{b.clientName}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{fmt(b.billDate)}</td>
                    <td className="px-3 py-3 text-slate-500">{fmt(b.dueDate)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold text-slate-900">₹{b.total.toFixed(2)}</div>
                      {b.computedStatus === "PARTIAL" && (
                        <div className="mt-0.5 space-y-0.5 text-[11px]">
                          <div className="font-medium text-emerald-600">
                            Paid: ₹{(b.paidAmount || 0).toFixed(2)}
                          </div>
                          <div className="font-semibold text-amber-600">
                            Pending: ₹{Math.max(0, b.total - (b.paidAmount || 0)).toFixed(2)}
                          </div>
                        </div>
                      )}
                      {b.computedStatus === "PAID" && (
                        <div className="mt-0.5 text-[10px] font-medium text-emerald-600">
                          Fully paid
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={b.computedStatus} />
                      {b.paymentMode && (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {b.paymentMode}
                          {b.paymentMode === "CHEQUE" && b.chequeNo ? ` · Chq ${b.chequeNo}` : ""}
                          {b.chequeStatus ? ` (${b.chequeStatus.toLowerCase()})` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <BillRowActions
                        bill={{
                          id: b.id,
                          billNo: b.billNo,
                          status: b.computedStatus,
                          chequeNo: b.chequeNo || "",
                          total: b.total,
                          paidAmount: b.paidAmount,
                          payments: b.payments,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
