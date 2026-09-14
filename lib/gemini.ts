import { GoogleGenAI } from "@google/genai";
import { renderBillTemplate, validateTemplateHtml } from "./template-engine";
import { buildSampleContext } from "./sample-data";
import { DEFAULT_BLOCKS, type BillAnalysis, type TemplateField, type CropBox } from "./types";
import { getBuiltin } from "./builtin-templates";

export function resolveGeminiKey(userKey?: string | null): string {
  return (process.env.GEMINI_API_KEY || userKey || "").trim();
}

export function isAiEnabled(userKey?: string | null): boolean {
  return resolveGeminiKey(userKey).length > 10;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function callGemini(key: string, parts: Part[], json: boolean, system?: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: key });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: json ? "application/json" : "text/plain",
      temperature: json ? 0.1 : 0.35,
      ...(system ? { systemInstruction: system } : {}),
    },
  });
  const text = res.text ?? "";
  if (!text.trim()) throw new Error("AI returned an empty response — try again.");
  return text;
}

function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === "yes" || v === 1;
}

function normBox(v: unknown): CropBox | undefined {
  if (!v || typeof v !== "object") return undefined;
  const b = v as Record<string, unknown>;
  const x = Number(b.x), y = Number(b.y), w = Number(b.w), h = Number(b.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= -0.05 && n <= 1.05)) return undefined;
  if (w <= 0.01 || h <= 0.01) return undefined;
  return { x, y, w, h };
}

/** Pass 1 — read the bill photo and return structured metadata (with no AI key: sensible mock). */
export async function analyzeBillImage(
  key: string | null,
  imageBase64: string,
  mimeType: string
): Promise<BillAnalysis> {
  if (!key) return mockAnalysis();

  const prompt = `You are an expert at reading Indian small-business bills/invoices from photos or scans. The image is a bill, often handwritten on a pre-printed letterhead (a bill-book page), sometimes a printed invoice.

Return ONLY a JSON object with exactly this shape (no markdown fences, no commentary):
{
 "businessName": string,          // seller/business name printed on the letterhead, exactly as written
 "tagline": string,               // the "Specialist in:" line or business description, or ""
 "address": string,               // full address lines joined with commas, or ""
 "phone": string,                 // phone/mobile numbers found, or ""
 "gstin": string,                 // GSTIN if clearly visible, or ""
 "hasLogo": boolean,              // is there a printed logo/graphic/emblem IMAGE on the letterhead?
 "hasSignature": boolean,         // is there a handwritten signature or stamp near "For <business>"/"Proprietor"?
 "hasGST": boolean,               // does the bill structure include GST columns/fields (CGST/SGST/IGST) or a GSTIN?
 "hasBankCheque": boolean,        // are printed bank details (A/C no, IFSC, UPI) or cheque fields present?
 "hasAmountWords": boolean,       // is there a "Rupees ______" amount-in-words line?
 "hasHSN": boolean,               // is there an HSN code column or printed HSN line?
 "logoBox": {"x":0.1,"y":0.05,"w":0.12,"h":0.15} or null,
 "signatureBox": {"x":0.6,"y":0.85,"w":0.2,"h":0.1} or null,
 "fields": [{"key":"orderNo","label":"Your Order No.","type":"text"}],
 "notesHint": string
}
Rules:
- logoBox/signatureBox: bounding box of the LOGO image / SIGNATURE-stamp only, coordinates normalized to the FULL image (0..1), x,y = top-left, w,h = size. null if not present.
- A handwritten text scribble is NOT a logo; only real printed graphics/emblems count.
- For hasSignature: a visible scribbled signature or round stamp counts as true.
- fields: EXTRA printed header fields on this bill besides seller info, client (M/s) info, bill-number and date — e.g. Order No, Delivery Note, Transport, Party's GST, E-way Bill, Vehicle No. Give lowerCamelCase keys, human labels, type "text"|"date"|"number". [] if none.
- notesHint: fixed printed fine-print/terms at the bottom (e.g. "E.&O.E.", "Subject to Mumbai jurisdiction"), or "".
- If unsure about hasLogo/hasBankCheque, answer false. For signature, lean true if any scribble/stamp exists.`;

  const raw = await callGemini(
    key,
    [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }],
    true
  );
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const fieldsRaw = Array.isArray(parsed.fields) ? parsed.fields : [];
  const fields: TemplateField[] = fieldsRaw
    .map((f) => {
      const o = f as Record<string, unknown>;
      const k = String(o.key || "").replace(/[^A-Za-z0-9_]/g, "");
      if (!k) return null;
      const type = o.type === "date" || o.type === "number" ? o.type : "text";
      return { key: k, label: String(o.label || k), type } as TemplateField;
    })
    .filter(Boolean) as TemplateField[];

  return {
    businessName: String(parsed.businessName || "").slice(0, 120),
    tagline: String(parsed.tagline || "").slice(0, 200),
    address: String(parsed.address || "").slice(0, 400),
    phone: String(parsed.phone || "").slice(0, 60),
    gstin: String(parsed.gstin || "").slice(0, 30),
    flags: {
      hasLogo: asBool(parsed.hasLogo),
      hasSignature: asBool(parsed.hasSignature),
      hasGST: asBool(parsed.hasGST),
      hasBank: asBool(parsed.hasBankCheque),
      hasAmountWords: asBool(parsed.hasAmountWords),
      hasHSN: asBool(parsed.hasHSN),
    },
    crops: {
      logo: normBox(parsed.logoBox),
      signature: normBox(parsed.signatureBox),
    },
    fields,
    notesHint: String(parsed.notesHint || "").slice(0, 300),
  };
}

/** Pass 2 — generate a Handlebars HTML template reproducing the bill layout. */
export async function generateTemplateHtml(
  key: string | null,
  imageBase64: string,
  mimeType: string,
  analysis: BillAnalysis,
  pageFormat: "A4" | "A5"
): Promise<string> {
  if (!key) return mockGenerate(analysis, pageFormat);

  const pageSize = pageFormat === "A4" ? "210mm 297mm" : "148mm 210mm";
  const example = getBuiltin("gst")!.html;

  const system = `You are an expert HTML coder who recreates Indian business bill/invoice layouts as print-ready HTML templates using Handlebars placeholders. You output complete, self-contained HTML documents and nothing else.`;

  const prompt = `Recreate the attached bill (photo of an Indian bill-book page or invoice) as a REUSABLE HTML template.

Metadata already extracted from this bill:
${JSON.stringify(
  {
    businessName: analysis.businessName,
    tagline: analysis.tagline,
    flags: analysis.flags,
    fields: analysis.fields,
    notesHint: analysis.notesHint,
  },
  null,
  2
)}

AVAILABLE TEMPLATE PLACEHOLDERS (use ONLY these, Handlebars syntax):
- Seller: {{seller.name}} {{seller.tagline}} {{seller.address}} {{seller.phone}} {{seller.gstin}}
- Client: {{client.name}} {{client.address}} {{client.phone}} {{client.gstin}}
- {{billNo}} {{billDate}} {{dueDate}}   (dates are pre-formatted strings — do not reformat)
- Items loop:
  {{#each items}} <tr><td>{{sr}}</td><td>{{description}}</td>{{#if hsn}}<div>{{hsn}}</div>{{/if}}<td>{{qtyDisplay}}</td><td>{{rateFmt}}</td><td>{{amountFmt}}</td></tr> {{/each}}
- Totals: {{totals.subtotalFmt}} {{totals.cgstFmt}} {{totals.sgstFmt}} {{totals.igstFmt}} {{totals.totalFmt}} {{totals.totalInWords}}
- Tax rates: {{tax.cgstRate}} {{tax.sgstRate}} {{tax.igstRate}}
- Bank: {{bank.bankName}} {{bank.accountNo}} {{bank.ifsc}} {{bank.upiId}}
- {{chequeNo}} {{notes}}
- Optional-block flags (use {{#if hasLogo}}...{{/if}}, hasSignature, hasGST, hasBank, hasAmountWords, hasHSN):
  {{#if hasLogo}}<img src="{{logoUrl}}" ...>{{/if}}   {{#if hasSignature}}<img src="{{signatureUrl}}" ...>{{/if}}
- Custom header fields detected on this bill: ${analysis.fields.length ? analysis.fields.map((f) => `{{extra.${f.key}}} ("${f.label}")`).join(", ") : "none"}

RULES:
1. Output ONLY the full HTML document, from <!DOCTYPE html> to </html>. No markdown fences, no comments about what you did.
2. <style> must include:  @page { size: ${pageSize}; margin: 7mm 8mm; }  (adjust margins slightly if needed). Use mm and pt units only. Minimum body font 7.5pt for A5, 8.5pt for A4.
3. NO external resources — no web fonts, no external images/CSS/JS. System fonts only (Georgia, 'Times New Roman', Arial, Helvetica, sans-serif).
4. The whole bill MUST fit on ONE page of ${pageFormat} portrait. Prefer compact spacing; A5 total content height must stay under ~195mm.
5. Money/date values are pre-formatted strings — print them as-is.
6. Faithfully reproduce the letterhead: name styling (size/color/weight), tagline line, address block, and the overall structure of the original bill (boxes, table columns, footer, signature area).
7. The items table MUST loop with {{#each items}} and include every column the original bill has.
8. Wrap logo/signature/bank/GST/amount-words sections in their {{#if ...}} flags. Logo/signature use {{logoUrl}} / {{signatureUrl}} inside the if.
9. Tables: use table-layout: fixed with <colgroup> widths.
10. Do not invent fields that are not in the placeholders or detected fields.

REFERENCE of correct Handlebars structure and print CSS (different bill, adapt style to the photo):
${example}`;

  const attempt = async (extra?: string) => {
    const parts: Part[] = [
      { text: extra ? `${prompt}\n\nFIX REQUIRED: ${extra}` : prompt },
      { inlineData: { mimeType, data: imageBase64 } },
    ];
    return callGemini(key, parts, false, system);
  };

  let html = (await attempt()).replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();

  // Validate by compiling + rendering with sample data; if it breaks, give the model one fix-up pass.
  const compiled = validateTemplateHtml(html, buildSampleContext(analysis.flags));
  if (!compiled.ok) {
    html = (await attempt(compiled.error || "Handlebars compile error")).replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    const recheck = renderBillTemplate(html, buildSampleContext(analysis.flags));
    if (!recheck) throw new Error("AI generated an invalid template twice. Try again.");
  }
  if (!/{{#each items}}/i.test(html)) {
    throw new Error("AI template is missing the items table loop. Try again.");
  }
  return html;
}

export function mockAnalysis(): BillAnalysis {
  return {
    businessName: "YOUR BUSINESS NAME",
    tagline: "SPECIALIST IN : YOUR WORKS & SERVICES",
    address: "Your Address Line, Near Landmark, City - 400 000.",
    phone: "98200 00000",
    gstin: "",
    flags: { ...DEFAULT_BLOCKS, hasBankCheque: false },
    crops: {},
    fields: [
      { key: "orderNo", label: "Your Order No.", type: "text" },
      { key: "orderDate", label: "Order Date", type: "date" },
    ],
    notesHint: "E. & O. E.",
    mock: true,
  };
}

export async function mockGenerate(analysis: BillAnalysis, pageFormat: "A4" | "A5"): Promise<string> {
  const useGst = analysis.flags.hasGST;
  const tpl = getBuiltin(useGst ? "gst" : "classic")!;
  return tpl.html;
}
