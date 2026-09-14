import { inr, fmtDate, amountToWords, round2 } from "./format";
import type { BillDraft, TemplateBlocks, BillItem } from "./types";

export function computeTotals(items: BillItem[], cgstRate: number, sgstRate: number, igstRate: number) {
  const subtotal = round2(items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
  const cgst = round2((subtotal * (Number(cgstRate) || 0)) / 100);
  const sgst = round2((subtotal * (Number(sgstRate) || 0)) / 100);
  const igst = round2((subtotal * (Number(igstRate) || 0)) / 100);
  const total = round2(subtotal + cgst + sgst + igst);
  return { subtotal, cgst, sgst, igst, total };
}

export interface SellerProfile {
  businessName?: string | null;
  businessTagline?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessGstin?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
  bankUpiId?: string | null;
}

export interface RenderAssetUrls {
  logoUrl?: string;
  signatureUrl?: string;
}

/**
 * Builds the full Handlebars context for a template render.
 * Money/date values are pre-formatted strings so templates are robust
 * even if they print them directly without the inr/dateFmt helpers.
 */
export function buildRenderContext(
  seller: SellerProfile,
  blocks: TemplateBlocks,
  draft: BillDraft,
  assetUrls: RenderAssetUrls = {}
): Record<string, unknown> {
  const totals = computeTotals(draft.items, draft.cgstRate, draft.sgstRate, draft.igstRate);

  const items = draft.items.map((it, i) => {
    const qty = Number(it.qty) || 0;
    const qtyStr = Number.isInteger(qty) ? String(qty) : String(round2(qty));
    return {
      sr: i + 1,
      description: it.description || "",
      hsn: it.hsn || "",
      qty,
      unit: it.unit || "",
      qtyDisplay: it.unit ? `${qtyStr} ${it.unit}` : qtyStr,
      rate: round2(it.rate),
      amount: round2(it.amount),
      rateFmt: inr(it.rate),
      amountFmt: inr(it.amount),
    };
  });

  const words =
    draft.amountInWords && draft.amountInWords.trim()
      ? draft.amountInWords.trim()
      : amountToWords(totals.total);

  const paidAmount = Number(draft.paidAmount) || 0;
  const pendingAmount = Math.max(0, round2(totals.total - paidAmount));
  const isPaid = paidAmount >= totals.total && totals.total > 0;
  const isPartial = paidAmount > 0 && pendingAmount > 0;

  return {
    billNo: draft.billNo || "",
    billDate: fmtDate(draft.billDate),
    dueDate: fmtDate(draft.dueDate),
    seller: {
      name: seller.businessName || "Your Business Name",
      tagline: seller.businessTagline || "",
      address: seller.businessAddress || "",
      phone: seller.businessPhone || "",
      gstin: seller.businessGstin || "",
    },
    client: {
      name: draft.client?.name || "",
      address: draft.client?.address || "",
      phone: draft.client?.phone || "",
      gstin: draft.client?.gstin || "",
    },
    items,
    totals: {
      ...totals,
      totalInWords: words,
      subtotalFmt: inr(totals.subtotal),
      cgstFmt: inr(totals.cgst),
      sgstFmt: inr(totals.sgst),
      igstFmt: inr(totals.igst),
      totalFmt: inr(totals.total),
      paidAmount,
      paidAmountFmt: inr(paidAmount),
      pendingAmount,
      pendingAmountFmt: inr(pendingAmount),
      isPaid,
      isPartial,
    },
    payment: {
      paidAmount,
      paidAmountFmt: inr(paidAmount),
      pendingAmount,
      pendingAmountFmt: inr(pendingAmount),
      isPaid,
      isPartial,
      isUnpaid: paidAmount === 0,
      mode: draft.paymentMode || "",
      chequeNo: draft.chequeNo || "",
      payments: draft.payments || [],
    },
    tax: {
      cgstRate: draft.cgstRate || 0,
      sgstRate: draft.sgstRate || 0,
      igstRate: draft.igstRate || 0,
    },
    bank: {
      bankName: seller.bankName || "",
      accountNo: seller.bankAccountNo || "",
      ifsc: seller.bankIfsc || "",
      upiId: seller.bankUpiId || "",
    },
    chequeNo: draft.chequeNo || "",
    notes: draft.notes || "",
    // optional-block flags
    ...blocks,
    // logo/signature data urls
    ...assetUrls,
    // custom header fields, available flat ({{orderNo}}) and as {{extra.orderNo}}, plus list for dynamic iterations
    ...(draft.extra || {}),
    extra: draft.extra || {},
    extraList: Object.entries(draft.extra || {})
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => ({
        key: k,
        label: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
        value: String(v),
      })),
  };
}
