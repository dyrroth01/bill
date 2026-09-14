import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { stripScripts, ensureHtmlDoc, prepareSourceImage } from "@/lib/ai-media";
import { DEFAULT_BLOCKS, type BillAnalysis } from "@/lib/types";

/**
 * Import an existing bill template: .html / .htm / .docx directly,
 * .pdf through the AI pipeline (needs a Gemini key).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });

    const name = file.name || "imported";
    const ext = (name.includes(".") ? name.split(".").pop()! : "").toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());

    let html: string | null = null;

    if (ext === "html" || ext === "htm") {
      html = stripScripts(ensureHtmlDoc(bytes.toString("utf8")));
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ buffer: bytes });
      html = stripScripts(ensureHtmlDoc(result.value || "<p>Empty document</p>"));
    } else if (ext === "pdf") {
      const { resolveGeminiKey, analyzeBillImage, generateTemplateHtml } = await import("@/lib/gemini");
      const key = resolveGeminiKey();
      if (!key) {
        return NextResponse.json(
          { error: "AI Bill Maker service is currently unavailable. Please check server configuration." },
          { status: 503 }
        );
      }
      const prepared = await prepareSourceImage(bytes, "application/pdf");
      const analysis: BillAnalysis = await analyzeBillImage(key, prepared.base64, "image/jpeg");
      html = await generateTemplateHtml(key, prepared.base64, "image/jpeg", analysis, "A5");
      const { parseFields } = await import("@/lib/api");
      const created = await db.template.create({
        data: {
          userId: user.id,
          name: analysis.businessName || name.replace(/\.pdf$/i, ""),
          description: "Imported from PDF via AI.",
          sourceType: "ai",
          html: stripScripts(html),
          fieldSchema: JSON.stringify(analysis.fields || []),
          blocks: JSON.stringify({ ...DEFAULT_BLOCKS, ...analysis.flags }),
          pageFormat: "A5",
        },
      });
      return NextResponse.json({ id: created.id, aiConverted: true });
    } else if (ext === "doc") {
      return NextResponse.json(
        { error: "Old .doc files are not supported. Save as .docx or .html in Word first." },
        { status: 400 }
      );
    } else {
      return NextResponse.json({ error: "Upload an .html, .docx or .pdf file" }, { status: 400 });
    }

    // Optional AI placeholder-izer for html/docx when a key exists
    let aiConverted = false;
    const { resolveGeminiKey } = await import("@/lib/gemini");
    const key = resolveGeminiKey();
    if (key) {
      try {
        html = await placeholderize(key, html!);
        aiConverted = true;
      } catch (e) {
        console.error("placeholderize failed, keeping raw import", e);
      }
    }

    const created = await db.template.create({
      data: {
        userId: user.id,
        name: name.replace(/\.(html?|docx)$/i, "").slice(0, 120),
        description: aiConverted
          ? "Imported file, converted to a fillable template by AI."
          : "Imported file. Open the editor to replace fixed text with placeholders (see the cheat-sheet).",
        sourceType: "import",
        html: stripScripts(html!),
        fieldSchema: JSON.stringify([]),
        blocks: JSON.stringify(DEFAULT_BLOCKS),
        pageFormat: /297mm/i.test(html!) ? "A4" : "A5",
      },
    });
    return NextResponse.json({ id: created.id, aiConverted });
  } catch (e) {
    return apiError(e);
  }
}

async function placeholderize(key: string, html: string): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: key });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt = `Convert this imported bill/invoice HTML document into a REUSABLE Handlebars template.

Replace fixed content with these placeholders where they appear (keep all styling/classes):
- {{seller.name}} {{seller.tagline}} {{seller.address}} {{seller.phone}} {{seller.gstin}}
- {{client.name}} {{client.address}} {{client.phone}} {{client.gstin}}
- {{billNo}} {{billDate}} {{dueDate}}
- Item data rows -> ONE loop row: {{#each items}} ...{{sr}} {{description}} {{hsn}} {{qtyDisplay}} {{rateFmt}} {{amountFmt}}... {{/each}}
- Totals: {{totals.subtotalFmt}} {{totals.cgstFmt}} {{totals.sgstFmt}} {{totals.igstFmt}} {{totals.totalFmt}} {{totals.totalInWords}}
- Bank: {{bank.bankName}} {{bank.accountNo}} {{bank.ifsc}} {{bank.upiId}} — {{notes}}
- Flags: wrap logo image in {{#if hasLogo}}<img src="{{logoUrl}}">{{/if}}, signature in {{#if hasSignature}}<img src="{{signatureUrl}}">{{/if}}, tax rows in {{#if hasGST}}, bank block in {{#if hasBank}}, amount-in-words in {{#if hasAmountWords}}.

Keep the document's existing CSS and @page rule. Ensure @page { size: ...mm ...mm; margin: ...mm; } exists. Output ONLY the full HTML document.`;
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt + "\n\nDOCUMENT:\n" + html.slice(0, 60000) }] }],
    config: { temperature: 0.2 },
  });
  const out = (res.text || "").replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  if (!out || out.length < 200) throw new Error("AI returned nothing useful");
  return stripScripts(out);
}
