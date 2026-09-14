export type FieldType = "text" | "date" | "number";

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
}

export interface TemplateBlocks {
  hasLogo: boolean;
  hasSignature: boolean;
  hasGST: boolean;
  hasBank: boolean;
  hasAmountWords: boolean;
  hasHSN: boolean;
}

export const DEFAULT_BLOCKS: TemplateBlocks = {
  hasLogo: false,
  hasSignature: true,
  hasGST: false,
  hasBank: false,
  hasAmountWords: true,
  hasHSN: false,
};

export interface BillItem {
  description: string;
  hsn?: string;
  qty: number;
  unit?: string;
  rate: number;
  amount: number;
}

export interface ClientInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}

export interface BankInfo {
  bankName?: string;
  accountNo?: string;
  ifsc?: string;
  upiId?: string;
}

export interface BillPayment {
  id: string;
  amount: number;
  date: string; // ISO or YYYY-MM-DD
  paymentMode: "CASH" | "UPI" | "CHEQUE" | "BANK" | string;
  chequeNo?: string;
  chequeStatus?: "PENDING" | "CLEARED" | "BOUNCED" | string;
  notes?: string;
  createdAt?: string;
}

export interface BillDraft {
  billNo: string;
  billDate: string; // yyyy-mm-dd
  dueDate?: string; // yyyy-mm-dd
  client: ClientInfo;
  items: BillItem[];
  extra: Record<string, string>;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  amountInWords?: string;
  notes?: string;
  chequeNo?: string;
  paidAmount?: number;
  paymentMode?: string;
  payments?: BillPayment[];
}

export interface CropBox {
  x: number; // normalized 0..1
  y: number;
  w: number;
  h: number;
}

export interface BillAnalysis {
  businessName?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  flags: TemplateBlocks & { hasBankCheque?: boolean };
  crops?: { logo?: CropBox; signature?: CropBox };
  fields: TemplateField[];
  notesHint?: string;
  mock?: boolean;
}

export const DEFAULT_UNITS = ["Nos", "Pcs", "Set", "Kg", "Mtr", "Hr", "Lot", "Job"];
