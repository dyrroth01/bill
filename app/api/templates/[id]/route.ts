import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, parseBlocks } from "@/lib/api";
import { validateTemplateHtml } from "@/lib/template-engine";
import { buildSampleContext } from "@/lib/sample-data";
import { sanitizeInvoiceHtml } from "@/lib/ai-media";

async function getTemplate(reqUserId: string, id: string) {
  return db.template.findFirst({ where: { id, userId: reqUserId } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const template = await getTemplate(user.id, id);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const template = await getTemplate(user.id, id);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const body = await req.json();
    const html = body.html !== undefined ? sanitizeInvoiceHtml(String(body.html)) : template.html;
    const blocks =
      body.blocks !== undefined ? parseBlocks(JSON.stringify(body.blocks)) : parseBlocks(template.blocks);

    const check = validateTemplateHtml(html, buildSampleContext(blocks));
    if (!check.ok) return NextResponse.json({ error: `Template error: ${check.error}` }, { status: 400 });

    await db.template.update({
      where: { id: template.id },
      data: {
        name: body.name !== undefined ? String(body.name).slice(0, 120) : template.name,
        description: body.description !== undefined ? String(body.description).slice(0, 500) || null : template.description,
        html,
        blocks: JSON.stringify(blocks),
        fieldSchema:
          body.fields !== undefined ? JSON.stringify(Array.isArray(body.fields) ? body.fields : []) : template.fieldSchema,
        pageFormat: body.pageFormat !== undefined ? (body.pageFormat === "A4" ? "A4" : "A5") : template.pageFormat,
        logoAssetId: body.logoAssetId !== undefined ? body.logoAssetId || null : template.logoAssetId,
        signatureAssetId:
          body.signatureAssetId !== undefined ? body.signatureAssetId || null : template.signatureAssetId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const template = await getTemplate(user.id, id);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const billCount = await db.bill.count({ where: { templateId: id } });
    if (billCount > 0) {
      // keep history intact; just hide it
      await db.template.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ ok: true, deactivated: true });
    }
    await db.template.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
