"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  Pencil,
  Download,
  RefreshCcw,
  Trash2,
  BadgeCheck,
  Loader2,
  Calendar,
  History,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import ShareBillButton from "./ShareBillButton";

export interface BillPaymentItem {
  id: string;
  amount: number;
  date: string;
  paymentMode: string;
  chequeNo?: string;
  chequeStatus?: string;
  notes?: string;
  createdAt?: string;
}

/** Actions for a single bill row: mark-paid / installment dialog, PDF, edit, delete. */
export default function BillRowActions({
  bill,
  compact,
}: {
  bill: {
    id: string;
    billNo: string;
    status: string;
    chequeNo?: string;
    total?: number;
    paidAmount?: number | null;
    payments?: string | BillPaymentItem[];
  };
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "INSTALLMENT">("FULL");
  const [installmentAmount, setInstallmentAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"CASH" | "UPI" | "CHEQUE" | "BANK">("CASH");
  const [chequeNo, setChequeNo] = useState(bill.chequeNo || "");
  const [chequeStatus, setChequeStatus] = useState<"PENDING" | "CLEARED" | "BOUNCED">("PENDING");
  const [notes, setNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const total = Number(bill.total) || 0;
  const alreadyPaid =
    bill.paidAmount !== undefined && bill.paidAmount !== null
      ? Number(bill.paidAmount)
      : bill.status === "PAID"
        ? total
        : 0;
  const currentPending = Math.max(0, Math.round((total - alreadyPaid) * 100) / 100);

  const parsedPayments: BillPaymentItem[] = useMemo(() => {
    if (!bill.payments) return [];
    if (Array.isArray(bill.payments)) return bill.payments;
    try {
      return JSON.parse(bill.payments);
    } catch {
      return [];
    }
  }, [bill.payments]);

  // Calculations for installment equation
  const instVal = parseFloat(installmentAmount) || 0;
  const effectiveInstVal = paymentType === "FULL" ? currentPending : Math.max(0, instVal);

  function openPaymentModal() {
    setActionError(null);
    setNotes("");
    setChequeNo(bill.chequeNo || "");
    setPaymentDate(new Date().toISOString().slice(0, 10));

    if (currentPending > 0) {
      setPaymentType(alreadyPaid > 0 ? "INSTALLMENT" : "FULL");
      setInstallmentAmount(currentPending > 0 ? String(currentPending) : "");
    } else {
      setPaymentType("FULL");
      setInstallmentAmount("");
    }
    setOpen(true);
  }

  async function handleSavePayment() {
    setActionError(null);
    setBusy(true);
    try {
      if (paymentType === "FULL") {
        const res = await fetch(`/api/bills/${bill.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "PAID",
            paymentMode: mode,
            chequeNo: mode === "CHEQUE" ? chequeNo : undefined,
            chequeStatus: mode === "CHEQUE" ? chequeStatus : undefined,
            paymentDate,
            notes: notes.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          setActionError(d.error || "Failed to record payment");
          return;
        }
      } else {
        const amt = parseFloat(installmentAmount);
        if (isNaN(amt) || amt <= 0) {
          setActionError("Please enter a valid installment amount greater than 0");
          return;
        }
        const res = await fetch(`/api/bills/${bill.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "INSTALLMENT",
            installment: {
              amount: amt,
              paymentMode: mode,
              chequeNo: mode === "CHEQUE" ? chequeNo : undefined,
              chequeStatus: mode === "CHEQUE" ? chequeStatus : undefined,
              date: paymentDate,
              notes: notes.trim() || undefined,
            },
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          setActionError(d.error || "Failed to record installment");
          return;
        }
      }

      setOpen(false);
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function markPending() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bills/${bill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESET" }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to reset payment");
      } else {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteInstallment(paymentId: string) {
    if (!confirm("Remove this installment payment?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bills/${bill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_INSTALLMENT", paymentId }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to remove installment");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await fetch(`/api/bills/${bill.id}`, { method: "DELETE" });
      router.push("/bills");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const iconBtn = "rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700";

  return (
    <>
      <div className={`flex items-center ${compact ? "justify-center" : "justify-end"} gap-0.5`}>
        {bill.status === "PENDING" || bill.status === "OVERDUE" ? (
          <button onClick={openPaymentModal} className={iconBtn} title="Mark as paid or add installment">
            <BadgeCheck className="h-4 w-4 hover:text-emerald-600" />
          </button>
        ) : bill.status === "PARTIAL" ? (
          <button
            onClick={openPaymentModal}
            className={`${iconBtn} !text-blue-600 hover:!bg-blue-50`}
            title="Partially paid — add installment or settle"
          >
            <BadgeCheck className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={openPaymentModal} className={iconBtn} title="View or manage payment">
            <RefreshCcw className="h-4 w-4 hover:text-slate-700" />
          </button>
        )}

        <a href={`/api/bills/${bill.id}/pdf?download=1`} className={iconBtn} title="Download PDF">
          <Download className="h-4 w-4" />
        </a>
        <ShareBillButton
          bill={{
            id: bill.id,
            billNo: bill.billNo,
            total: bill.total,
            status: bill.status,
          }}
          variant="icon"
        />
        <Link href={`/bills/${bill.id}`} className={iconBtn} title="View">
          <Eye className="h-4 w-4" />
        </Link>
        <Link href={`/bills/${bill.id}/edit`} className={iconBtn} title="Edit">
          <Pencil className="h-4 w-4" />
        </Link>
        <button
          onClick={() => setConfirmDelete(true)}
          className={`${iconBtn} hover:!bg-red-50 hover:!text-red-500`}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Payment / Installment Dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-lg overflow-hidden p-6 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
                <p className="text-xs text-slate-500">Bill #{bill.billNo}</p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                  bill.status === "PAID"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : bill.status === "PARTIAL"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {bill.status === "PAID"
                  ? "Fully Paid"
                  : bill.status === "PARTIAL"
                    ? "Partially Paid"
                    : "Unpaid / Pending"}
              </span>
            </div>

            {/* Financial Summary Card */}
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center border border-slate-200/70">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Bill</div>
                <div className="mt-0.5 font-bold text-slate-800">₹{total.toFixed(2)}</div>
              </div>
              <div className="border-x border-slate-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Already Paid</div>
                <div className="mt-0.5 font-bold text-emerald-700">₹{alreadyPaid.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Current Pending</div>
                <div className="mt-0.5 font-bold text-amber-700">₹{currentPending.toFixed(2)}</div>
              </div>
            </div>

            {/* Payment Type Tabs */}
            <div className="mt-4 flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setPaymentType("FULL");
                  setInstallmentAmount(String(currentPending));
                }}
                className={`flex-1 rounded-md py-1.5 transition ${
                  paymentType === "FULL"
                    ? "bg-white text-indigo-600 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Full Payment {currentPending > 0 ? `(₹${currentPending.toFixed(2)})` : ""}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentType("INSTALLMENT");
                  if (!installmentAmount) {
                    setInstallmentAmount(currentPending > 0 ? String(Math.round(currentPending / 2)) : "");
                  }
                }}
                className={`flex-1 rounded-md py-1.5 transition ${
                  paymentType === "INSTALLMENT"
                    ? "bg-white text-indigo-600 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Pay in Installment (Partial)
              </button>
            </div>

            {/* Installment Amount Input */}
            {paymentType === "INSTALLMENT" && (
              <div className="mt-4">
                <label className="label flex items-center justify-between">
                  <span>Installment amount to pay now</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    Max pending: ₹{currentPending.toFixed(2)}
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={currentPending}
                    placeholder="Enter installment amount"
                    value={installmentAmount}
                    onChange={(e) => setInstallmentAmount(e.target.value)}
                    className="field !pl-7 font-bold text-slate-800"
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* Payment Details Form */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Payment mode</label>
                <select className="field text-xs" value={mode} onChange={(e) => setMode(e.target.value as never)}>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / Online</option>
                  <option value="BANK">Bank transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="label flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Date
                </label>
                <input
                  type="date"
                  className="field text-xs"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
            </div>

            {mode === "CHEQUE" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Cheque number</label>
                  <input
                    className="field text-xs"
                    placeholder="e.g. 000412"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Cheque status</label>
                  <select
                    className="field text-xs"
                    value={chequeStatus}
                    onChange={(e) => setChequeStatus(e.target.value as never)}
                  >
                    <option value="PENDING">Pending clearance</option>
                    <option value="CLEARED">Cleared</option>
                    <option value="BOUNCED">Bounced</option>
                  </select>
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="label">Note / Reference (optional)</label>
              <input
                className="field text-xs"
                placeholder="e.g. Token advance, 1st installment, UPI ref #"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Installments History (if any) */}
            {parsedPayments.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                >
                  <History className="h-3.5 w-3.5" />
                  {showHistory
                    ? "Hide installment history"
                    : `View previous installments (${parsedPayments.length})`}
                </button>

                {showHistory && (
                  <div className="mt-2 max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs">
                    {parsedPayments.map((p, idx) => (
                      <div key={p.id || idx} className="flex items-center justify-between py-1.5 text-slate-700">
                        <div>
                          <span className="font-bold">Installment #{idx + 1}: ₹{Number(p.amount).toFixed(2)}</span>
                          <span className="ml-1.5 text-slate-400">· {p.paymentMode}</span>
                          <span className="ml-1.5 text-slate-400">· {p.date}</span>
                          {p.notes && <p className="text-[11px] text-slate-500 italic">{p.notes}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteInstallment(p.id)}
                          className="text-slate-400 hover:text-red-500 p-1"
                          title="Delete this installment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action Error */}
            {actionError && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
              {alreadyPaid > 0 || bill.status === "PAID" ? (
                <button
                  type="button"
                  onClick={markPending}
                  disabled={busy}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                >
                  Reset to unpaid
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary !py-1.5 text-xs font-semibold"
                  onClick={handleSavePayment}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : paymentType === "FULL" ? (
                    `Save Full Payment (₹${currentPending.toFixed(2)})`
                  ) : (
                    `Save Installment (₹${effectiveInstVal.toFixed(2)})`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900">Delete bill #{bill.billNo}?</h3>
            <p className="mt-2 text-sm text-slate-500">The PDF and record will be removed permanently.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={doDelete} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
