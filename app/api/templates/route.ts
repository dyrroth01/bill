import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, parseBlocks, parseFields } from "@/lib/api";
import { validateTemplateHtml } from "@/lib/template-engine";
import { buildSampleContext } from "@/lib/sample-data";
import { sanitizeInvoiceHtml } from "@/lib/ai-media";

export async function GET() {
  try {
    const user = await requireUser();
    const templates = await db.template.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { bills: true } } },
    });
    return NextResponse.json({ templates });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const rawHtml = String(body.html || "");
    if (!rawHtml.trim()) return NextResponse.json({ error: "Template HTML is required" }, { status: 400 });

    const html = sanitizeInvoiceHtml(rawHtml);
    const blocks = parseBlocks(JSON.stringify(body.blocks || {}));
    const check = validateTemplateHtml(html, buildSampleContext(blocks));
    if (!check.ok) return NextResponse.json({ error: `Template error: ${check.error}` }, { status: 400 });

    const template = await db.template.create({
      data: {
        userId: user.id,
        name: String(body.name || "Untitled template").slice(0, 120),
        description: body.description ? String(body.description).slice(0, 500) : null,
        sourceType: ["ai", "import", "builtin", "blank"].includes(body.sourceType) ? body.sourceType : "blank",
        html,
        fieldSchema: JSON.stringify(Array.isArray(body.fields) ? body.fields : []),
        blocks: JSON.stringify(blocks),
        pageFormat: body.pageFormat === "A4" ? "A4" : "A5",
        logoAssetId: body.logoAssetId || null,
        signatureAssetId: body.signatureAssetId || null,
      },
    });
    return NextResponse.json({ id: template.id });
  } catch (e) {
    return apiError(e);
  }
}
