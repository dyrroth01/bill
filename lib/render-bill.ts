import { db } from "./db";
import { buildRenderContext, type SellerProfile } from "./context";
import { renderBillTemplate } from "./template-engine";
import { renderHtmlToPdf } from "./pdf";
import { fileToDataUrl } from "./assets";
import { parseBlocks } from "./api";
import type { BillDraft } from "./types";

export interface TemplateSnapshot {
  id?: string;
  name?: string;
  html: string;
  pageFormat: string;
  blocks: string;
  fieldSchema?: string;
  logoUrl?: string;
  signatureUrl?: string;
  sellerSnapshot?: SellerProfile;
}

type TemplateRow = {
  id?: string;
  html: string;
  pageFormat: string;
  blocks: string;
  fieldSchema?: string;
  logoAssetId?: string | null;
  signatureAssetId?: string | null;
};

export async function assetDataUrlFor(userId: string, assetId: string | null | undefined): Promise<string | undefined> {
  if (!assetId) return undefined;
  const asset = await db.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) return undefined;
  try {
    return await fileToDataUrl(asset.filePath, asset.mimeType);
  } catch {
    return undefined;
  }
}

/**
 * Creates an immutable snapshot of the template, including embedded logo/signature
 * and seller details, so the bill can be rendered faithfully even if the template
 * is later modified or deleted.
 */
export async function createTemplateSnapshot(
  userId: string,
  templateId: string,
  seller: SellerProfile
): Promise<string | null> {
  try {
    const template = await db.template.findFirst({ where: { id: templateId, userId } });
    if (!template) return null;

    const [logoUrl, signatureUrl] = await Promise.all([
      assetDataUrlFor(userId, template.logoAssetId),
      assetDataUrlFor(userId, template.signatureAssetId),
    ]);

    const snapshot: TemplateSnapshot = {
      id: template.id,
      name: template.name,
      html: template.html,
      pageFormat: template.pageFormat,
      blocks: template.blocks,
      fieldSchema: template.fieldSchema,
      logoUrl,
      signatureUrl,
      sellerSnapshot: {
        businessName: seller.businessName,
        businessTagline: seller.businessTagline,
        businessAddress: seller.businessAddress,
        businessPhone: seller.businessPhone,
        businessGstin: seller.businessGstin,
        bankName: seller.bankName,
        bankAccountNo: seller.bankAccountNo,
        bankIfsc: seller.bankIfsc,
        bankUpiId: seller.bankUpiId,
      },
    };

    return JSON.stringify(snapshot);
  } catch (err) {
    console.warn("Failed to create template snapshot:", err);
    return null;
  }
}

export async function buildBillHtml(
  userId: string,
  seller: SellerProfile,
  template: TemplateRow | TemplateSnapshot,
  draft: BillDraft,
  cachedAssets?: { logoUrl?: string; signatureUrl?: string }
): Promise<{ html: string; pageFormat: string }> {
  let logoUrl = cachedAssets?.logoUrl;
  let signatureUrl = cachedAssets?.signatureUrl;

  // If template is already a snapshot with embedded logo/signature
  if ("logoUrl" in template && template.logoUrl) {
    logoUrl = template.logoUrl;
  }
  if ("signatureUrl" in template && template.signatureUrl) {
    signatureUrl = template.signatureUrl;
  }

  // Otherwise load from DB assets
  if (!logoUrl && "logoAssetId" in template && template.logoAssetId) {
    logoUrl = await assetDataUrlFor(userId, template.logoAssetId);
  }
  if (!signatureUrl && "signatureAssetId" in template && template.signatureAssetId) {
    signatureUrl = await assetDataUrlFor(userId, template.signatureAssetId);
  }

  // Use historical seller snapshot if available in the template snapshot
  const effectiveSeller =
    ("sellerSnapshot" in template && template.sellerSnapshot?.businessName)
      ? { ...seller, ...template.sellerSnapshot }
      : seller;

  const context = buildRenderContext(effectiveSeller, parseBlocks(template.blocks), draft, {
    logoUrl,
    signatureUrl,
  });
  let html = renderBillTemplate(template.html, context);
  const pageFormat = template.pageFormat || "A5";

  html = prepareHtmlForPrintAndPdf(html, pageFormat, draft.billNo);

  return { html, pageFormat };
}

/**
 * Standardizes HTML documents for both browser printing ("Save as PDF") and headless PDF generation:
 * 1. Sets a dedicated <title> (e.g. "Invoice #2") to suppress browser website title stamps.
 * 2. Uses named page sizes (A5 / A4) so Chromium selects the true paper size instead of defaulting to Letter.
 * 3. Sets @page margin to 0 to prevent Chromium from injecting headers (date/title) and footers (URL).
 * 4. Moves margin spacing into body padding so the bill layout has exact padding on both screen and paper.
 * 5. Enables exact color adjustment and hides broken empty image tags.
 */
export function prepareHtmlForPrintAndPdf(
  rawHtml: string,
  pageFormat: string = "A5",
  billNo?: string
): string {
  const isA4 = (pageFormat || "").toUpperCase() === "A4";
  const standardSize = isA4 ? "A4 portrait" : "A5 portrait";
  const titleText = billNo ? `Invoice #${billNo}` : "Invoice";

  let html = rawHtml;

  // 1. Ensure <title> is set so browser print never falls back to parent window title
  if (/<title[\s>]/i.test(html)) {
    html = html.replace(/<title>[\s\S]*?<\/title>/gi, `<title>${titleText}</title>`);
  } else if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `  <title>${titleText}</title>\n</head>`);
  }

  // 2. Extract existing @page margin if present
  let extractedMargin = isA4 ? "12mm" : "7mm 8mm 6mm 8mm";
  const pageMatch = html.match(/@page\s*\{([^}]+)\}/i);
  if (pageMatch) {
    const marginMatch = pageMatch[1].match(/margin:\s*([^;]+);?/i);
    if (marginMatch && marginMatch[1].trim()) {
      extractedMargin = marginMatch[1].trim();
    }
  }

  // 3. Remove raw @page rules so standardized named sizes take precedence
  html = html.replace(/@page\s*\{[^}]+\}/gi, "");

  // 4. Inject standardized print & page styles
  const printStyles = `
<style id="billflow-print-rules">
  @page {
    size: ${standardSize};
    margin: 0mm !important;
  }
  @media print {
    @page {
      size: ${standardSize};
      margin: 0mm !important;
    }
    html, body {
      margin: 0 !important;
      padding: ${extractedMargin} !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      background: #ffffff !important;
    }
  }
  @media screen {
    body {
      padding: ${extractedMargin};
    }
  }
  img[src=""], img:not([src]) {
    display: none !important;
  }
</style>
`;

  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${printStyles}\n</head>`);
  } else {
    html = printStyles + html;
  }

  return html;
}

/** Extracts BillDraft from a Bill DB row */
export async function billToDraft(
  userId: string,
  bill: {
    billNo: string;
    billDate: Date;
    dueDate: Date | null;
    clientId: string | null;
    clientName: string;
    items: string;
    extra: string;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    amountInWords: string | null;
    notes: string | null;
    chequeNo: string | null;
    paidAmount: number;
    status: string;
    total: number;
    paymentMode: string | null;
    payments: string;
  }
): Promise<BillDraft> {
  let clientInfo = { address: "", phone: "", email: "", gstin: "" };
  if (bill.clientId) {
    const c = await db.client.findFirst({ where: { id: bill.clientId, userId } });
    if (c) clientInfo = { address: c.address || "", phone: c.phone || "", email: c.email || "", gstin: c.gstin || "" };
  }

  return {
    billNo: bill.billNo,
    billDate: bill.billDate.toISOString().slice(0, 10),
    dueDate: bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : undefined,
    client: { name: bill.clientName, ...clientInfo },
    items: JSON.parse(bill.items || "[]"),
    extra: JSON.parse(bill.extra || "{}"),
    cgstRate: bill.cgstRate,
    sgstRate: bill.sgstRate,
    igstRate: bill.igstRate,
    amountInWords: bill.amountInWords || "",
    notes: bill.notes || "",
    chequeNo: bill.chequeNo || "",
    paidAmount: Number(bill.paidAmount) || (bill.status === "PAID" ? Number(bill.total) : 0),
    paymentMode: bill.paymentMode || undefined,
    payments: JSON.parse(bill.payments || "[]"),
  };
}

/**
 * Builds HTML for any bill using its immutable template snapshot (or fallback template).
 */
export async function getBillHtmlForRender(
  user: { id: string } & SellerProfile,
  bill: {
    templateSnapshot?: string | null;
    templateId?: string | null;
    billNo: string;
    billDate: Date;
    dueDate: Date | null;
    clientId: string | null;
    clientName: string;
    items: string;
    extra: string;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    amountInWords: string | null;
    notes: string | null;
    chequeNo: string | null;
    paidAmount: number;
    status: string;
    total: number;
    paymentMode: string | null;
    payments: string;
  }
): Promise<{ html: string; pageFormat: string } | null> {
  let templateObj: TemplateSnapshot | TemplateRow | null = null;

  // 1. Try template snapshot first (historical fidelity)
  if (bill.templateSnapshot) {
    try {
      templateObj = JSON.parse(bill.templateSnapshot) as TemplateSnapshot;
    } catch {}
  }

  // 2. Fallback to active template in DB
  if (!templateObj && bill.templateId) {
    templateObj = await db.template.findFirst({ where: { id: bill.templateId, userId: user.id } });
  }

  // 3. Fallback to any user template if none linked
  if (!templateObj) {
    templateObj = await db.template.findFirst({ where: { userId: user.id } });
  }

  if (!templateObj) return null;

  const draft = await billToDraft(user.id, bill);
  return buildBillHtml(user.id, user, templateObj, draft);
}

/**
 * Generates the bill PDF in-memory on-demand without writing any file to disk.
 * Returns the PDF bytes buffer and page format.
 */
export async function renderBillPdfBuffer(
  user: { id: string } & SellerProfile,
  bill: {
    id: string;
    templateSnapshot?: string | null;
    templateId: string | null;
    clientName: string;
    billNo: string;
    billDate: Date;
    dueDate: Date | null;
    clientId: string | null;
    items: string;
    extra: string;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    amountInWords: string | null;
    notes: string | null;
    chequeNo: string | null;
    paidAmount: number;
    status: string;
    total: number;
    paymentMode: string | null;
    payments: string;
  }
): Promise<{ bytes: Buffer; pageFormat: string } | null> {
  try {
    const rendered = await getBillHtmlForRender(user, bill);
    if (!rendered) return null;
    const bytes = await renderHtmlToPdf(rendered.html, rendered.pageFormat);
    return { bytes, pageFormat: rendered.pageFormat };
  } catch (e) {
    console.error("PDF render failed for bill", bill.id, e);
    return null;
  }
}
