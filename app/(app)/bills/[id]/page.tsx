import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { effectiveStatus } from "@/lib/bills";
import { getBillHtmlForRender } from "@/lib/render-bill";
import BillRowActions from "@/components/BillRowActions";
import BillPrintButton from "@/components/BillPrintButton";
import ShareBillButton from "@/components/ShareBillButton";
import { ArrowLeft, CheckCircle2, Clock, CreditCard, History } from "lucide-react";

export const dynamic = "force-dynamic";

const badge: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-blue-50 text-blue-700 border-blue-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  OVERDUE: "bg-red-50 text-red-600 border-red-200",
};

const badgeLabel: Record<string, string> = {
  PAID: "FULLY PAID",
  PARTIAL: "PARTIALLY PAID",
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
};

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const bill = await db.bill.findFirst({
    where: { id, userId: user.id },
    include: { template: true, client: true },
  });
  if (!bill) notFound();

  let html = "";
  let pageFormat = 560;
  const renderResult = await getBillHtmlForRender(user, bill);
  if (renderResult) {
    html = renderResult.html;
    pageFormat = renderResult.pageFormat === "A4" ? 794 : 560;
  }

  const status = effectiveStatus(bill);
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("-") : "—");

  const total = Number(bill.total) || 0;
  const paidAmount = bill.paidAmount > 0 ? bill.paidAmount : status === "PAID" ? total : 0;
  const pendingAmount = Math.max(0, Math.round((total - paidAmount) * 100) / 100);
  const paidPercent = total > 0 ? Math.min(100, Math.round((paidAmount / total) * 100)) : 0;

  let parsedPayments: Array<{
    id: string;
    amount: number;
    date: string;
    paymentMode: string;
    chequeNo?: string;
    chequeStatus?: string;
    notes?: string;
  }> = [];
  try {
    parsedPayments = JSON.parse(bill.payments || "[]");
  } catch {}

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/bills" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> All bills
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Bill #{bill.billNo}</h1>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badge[status]}`}>
              {badgeLabel[status] || status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {bill.clientName} · {bill.template?.name || "no template"} · created {fmt(bill.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareBillButton
            bill={{
              id: bill.id,
              billNo: bill.billNo,
              total: bill.total,
              clientName: bill.clientName,
              status,
            }}
            label="Share bill"
          />
          <BillRowActions
            bill={{
              id: bill.id,
              billNo: bill.billNo,
              status,
              chequeNo: bill.chequeNo || "",
              total: bill.total,
              paidAmount: bill.paidAmount,
              payments: bill.payments,
            }}
          />
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="card mt-5 grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Bill date</div>
          <div className="mt-1 font-semibold text-slate-800">{fmt(bill.billDate)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Due date</div>
          <div className="mt-1 font-semibold text-slate-800">{fmt(bill.dueDate)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Total amount</div>
          <div className="mt-1 font-bold text-slate-900">₹{total.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Amount paid</div>
          <div className="mt-1 font-bold text-emerald-700">₹{paidAmount.toFixed(2)}</div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber-600">Pending balance</div>
          <div className="mt-1 font-bold text-amber-700">₹{pendingAmount.toFixed(2)}</div>
        </div>
      </div>

      {/* Installments & Payment Tracking Card */}
      <div className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <CreditCard className="h-4 w-4 text-indigo-600" /> Payment & Installment Details
          </div>
          <div className="text-xs font-semibold text-slate-600">
            {status === "PAID" ? (
              <span className="text-emerald-600 font-bold inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Settled in full
              </span>
            ) : status === "PARTIAL" ? (
              <span className="text-blue-600 font-bold inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Partially Paid · ₹{pendingAmount.toFixed(2)} remaining
              </span>
            ) : (
              <span className="text-amber-600 font-bold">Awaiting payment</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs font-medium text-slate-600 mb-1.5">
            <span>Payment Progress ({paidPercent}% paid)</span>
            <span>
              ₹{paidAmount.toFixed(2)} / ₹{total.toFixed(2)}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all duration-500 ${
                paidPercent >= 100 ? "bg-emerald-500" : paidPercent > 0 ? "bg-indigo-600" : "bg-transparent"
              }`}
              style={{ width: `${paidPercent}%` }}
            />
          </div>
        </div>

        {/* Formula Display Box */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 border border-slate-200/60">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Balance formula</div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 font-mono text-xs sm:text-sm font-semibold text-slate-800">
            <span className="whitespace-nowrap">Amount: ₹{total.toFixed(2)}</span>
            <span className="text-indigo-600 font-bold">−</span>
            <span className="text-emerald-700 font-bold whitespace-nowrap">Paid: ₹{paidAmount.toFixed(2)}</span>
            <span className="text-indigo-600 font-bold">=</span>
            <span className="text-amber-700 font-bold whitespace-nowrap">Pending: ₹{pendingAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Installments History */}
        {parsedPayments.length > 0 ? (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              <History className="h-3.5 w-3.5 text-indigo-600" /> Recorded Installments ({parsedPayments.length})
            </div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
              {parsedPayments.map((p, idx) => (
                <div key={p.id || idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-3 text-xs hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-900">
                      Installment #{idx + 1}: ₹{Number(p.amount).toFixed(2)}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      {p.date} · via <b className="text-slate-700">{p.paymentMode}</b>
                      {p.paymentMode === "CHEQUE" && p.chequeNo ? ` (Chq ${p.chequeNo})` : ""}
                      {p.notes ? ` · "${p.notes}"` : ""}
                    </div>
                  </div>
                  <div className="self-start sm:self-center">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 border border-emerald-200 text-[11px]">
                      Paid
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : bill.status === "PAID" ? (
          <div className="mt-3 text-xs text-slate-500">
            Paid via <b className="text-slate-700">{bill.paymentMode || "Cash"}</b>
            {bill.chequeNo ? ` · Cheque ${bill.chequeNo}` : ""}
            {bill.chequeStatus ? ` (${bill.chequeStatus.toLowerCase()})` : ""}
          </div>
        ) : null}
      </div>

      {bill.notes && (
        <div className="card mt-4 p-4 sm:p-5 text-sm text-slate-600">
          <span className="font-bold text-slate-800">Notes: </span>
          {bill.notes}
        </div>
      )}

      {/* Bill Document Preview */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <span className="text-sm font-bold text-slate-800">Bill document</span>
            <span className="ml-2 text-[11px] text-slate-400 hidden sm:inline">({renderResult?.pageFormat || "Standard"})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ShareBillButton
              bill={{
                id: bill.id,
                billNo: bill.billNo,
                total: bill.total,
                clientName: bill.clientName,
                status,
              }}
              variant="secondary"
              label="Share PDF"
            />
            <BillPrintButton iframeId="bill-document-frame" billNo={bill.billNo} />
            <a href={`/api/bills/${bill.id}/pdf`} target="_blank" className="btn-secondary !py-1.5 text-xs">
              Open PDF
            </a>
          </div>
        </div>
        {html ? (
          <div className="w-full overflow-x-auto bg-slate-200 p-2 sm:p-5">
            <div className="flex justify-center min-w-min mx-auto">
              <iframe
                id="bill-document-frame"
                title="bill document"
                srcDoc={html}
                style={{ width: pageFormat, minWidth: pageFormat, height: pageFormat === 794 ? 1050 : 750 }}
                className="border-0 bg-white shadow-md rounded-sm block"
              />
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            This bill has no template attached (the template may have been deleted). The record and amounts are kept.
          </div>
        )}
      </div>
    </div>
  );
}
