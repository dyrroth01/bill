export type BillStatus = "PAID" | "PARTIAL" | "PENDING" | "OVERDUE";

function todayUtcMidnight(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
}

export function effectiveStatus(bill: {
  status: string;
  dueDate: Date | null;
  total?: number;
  paidAmount?: number | null;
}): BillStatus {
  const total = Number(bill.total) || 0;
  const paid =
    bill.paidAmount !== undefined && bill.paidAmount !== null
      ? Number(bill.paidAmount)
      : bill.status === "PAID"
        ? total
        : 0;

  if (bill.status === "PAID" || (total > 0 && paid >= total)) return "PAID";
  if (paid > 0 && paid < total) return "PARTIAL";
  if (bill.dueDate && new Date(bill.dueDate).getTime() < todayUtcMidnight().getTime()) return "OVERDUE";
  return "PENDING";
}

export function computeBillBalance(bill: {
  total: number;
  paidAmount?: number | null;
  status?: string;
}) {
  const total = Number(bill.total) || 0;
  const paidAmount =
    bill.paidAmount !== undefined && bill.paidAmount !== null
      ? Number(bill.paidAmount)
      : bill.status === "PAID"
        ? total
        : 0;
  const pendingAmount = Math.max(0, Math.round((total - paidAmount) * 100) / 100);
  return {
    total,
    paidAmount,
    pendingAmount,
    isPaid: (total > 0 && paidAmount >= total) || bill.status === "PAID",
    isPartial: paidAmount > 0 && pendingAmount > 0,
  };
}

/** "101" -> "102", "INV-04" -> "INV-05", "A/12" -> "A/13" */
export function suggestNextBillNo(last?: string | null): string {
  if (!last) return "1";
  const m = last.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return last;
  const [, prefix, num, suffix] = m;
  const next = String(Number(num) + 1).padStart(num.length >= 2 && num.startsWith("0") ? num.length : 1, "0");
  return `${prefix}${next}${suffix}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short" });
}

export interface ExtractedPayment {
  amount: number;
  date: Date;
  paymentMode?: string;
  chequeNo?: string;
  notes?: string;
}

export function getBillPaymentsList(bill: {
  payments?: string | null;
  paidAmount?: number | null;
  paidAt?: Date | null;
  billDate?: Date | null;
  status?: string;
  total?: number;
  paymentMode?: string | null;
  chequeNo?: string | null;
}): ExtractedPayment[] {
  try {
    const parsed = JSON.parse(bill.payments || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((p: any) => Number(p.amount) > 0)
        .map((p: any) => ({
          amount: Number(p.amount),
          date: p.date ? new Date(p.date) : bill.paidAt || bill.billDate || new Date(),
          paymentMode: p.paymentMode || bill.paymentMode || undefined,
          chequeNo: p.chequeNo || bill.chequeNo || undefined,
          notes: p.notes,
        }));
    }
  } catch {}

  const balance = computeBillBalance({
    total: Number(bill.total) || 0,
    paidAmount: bill.paidAmount,
    status: bill.status,
  });
  if (balance.paidAmount > 0) {
    return [
      {
        amount: balance.paidAmount,
        date: bill.paidAt || bill.billDate || new Date(),
        paymentMode: bill.paymentMode || undefined,
        chequeNo: bill.chequeNo || undefined,
      },
    ];
  }
  return [];
}

