import type { BillDraft, TemplateBlocks } from "./types";
import { buildRenderContext, type SellerProfile } from "./context";

export const SAMPLE_SELLER: SellerProfile = {
  businessName: "SHARMA ENGINEERING WORKS",
  businessTagline: "SHAPING, MILLING, TURNING & FITTING WORKS",
  businessAddress: "Near Shivneri Office, Room No. 7, Ganesh Nagar, Kandivli (W), Mumbai - 400 067.",
  businessPhone: "98200 00000",
  businessGstin: "27ABCDE1234F1Z5",
  bankName: "HDFC Bank, Kandivli Branch",
  bankAccountNo: "50100 12345678",
  bankIfsc: "HDFC0000123",
  bankUpiId: "sharmaeng@okhdfcbank",
};

export function sampleDraft(): BillDraft {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 30);
  return {
    billNo: "321",
    billDate: today.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    client: {
      name: "PHARMA FILL TECHNOLOGIES",
      address: " Gala No 28, Lobsan & Jonia Industries, Near HP Petrol Pump, Vasai Phata, Vasai (E) 402208",
      phone: "",
      gstin: "",
    },
    items: [
      { description: "SOT 40T 25T Raceway M.S Plate 15.4x235x235", hsn: "8421000", qty: 2.5, unit: "", rate: 1700, amount: 4250 },
      { description: "M.S Plate 40.4x185x190", hsn: "8421000", qty: 2, unit: "Nos", rate: 600, amount: 1200 },
      { description: "SS304 15# x 210x365", hsn: "8421000", qty: 2, unit: "Nos", rate: 2000, amount: 4000 },
      { description: "Tool No. 495 for Polishing — Hardchrome + Etching", hsn: "", qty: 1, unit: "No", rate: 1500, amount: 1500 },
    ],
    extra: { orderNo: "1619", orderDate: today.toISOString().slice(0, 10) },
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 0,
    amountInWords: "",
    notes: "",
    chequeNo: "",
  };
}

/**
 * Builds the context for sample previews. When a seller profile is given
 * (the signed-in user's settings), its non-empty fields override the
 * sample seller so previews show the user's own business details;
 * anything not filled in still falls back to the sample data.
 */
export function buildSampleContext(
  blocks: TemplateBlocks | Record<string, unknown>,
  assetUrls: { logoUrl?: string; signatureUrl?: string } = {},
  seller?: SellerProfile | null
): Record<string, unknown> {
  const merged: SellerProfile = { ...SAMPLE_SELLER };
  for (const [key, value] of Object.entries(seller || {})) {
    if (typeof value === "string" && value.trim()) {
      (merged as Record<string, unknown>)[key] = value.trim();
    }
  }
  return buildRenderContext(merged, blocks as TemplateBlocks, sampleDraft(), assetUrls);
}
