import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, parseBlocks, parseDraft } from "@/lib/api";
import { buildBillHtml } from "@/lib/render-bill";

/** Live preview: render a template with an in-progress bill draft. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const template = await db.template.findFirst({ where: { id, userId: user.id } });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const body = await req.json();
    const draft = parseDraft(body.draft || body);
    const { html } = await buildBillHtml(user.id, user, template, draft);
    return NextResponse.json({ html });
  } catch (e) {
    return apiError(e);
  }
}

/** GET = preview with sample data (used by template editor / builtin gallery). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const template = await db.template.findFirst({ where: { id, userId: user.id } });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const { buildSampleContext } = await import("@/lib/sample-data");
    const { renderBillTemplate } = await import("@/lib/template-engine");
    const { fileToDataUrl } = await import("@/lib/assets");

    const blocks = parseBlocks(template.blocks);
    const assetUrls: Record<string, string> = {};
    for (const [key, assetId] of [
      ["logoUrl", template.logoAssetId],
      ["signatureUrl", template.signatureAssetId],
    ] as const) {
      if (assetId) {
        const asset = await db.asset.findFirst({ where: { id: assetId, userId: user.id } });
        if (asset) {
          try {
            assetUrls[key] = await fileToDataUrl(asset.filePath, asset.mimeType);
          } catch {}
        }
      }
    }
    const html = renderBillTemplate(template.html, buildSampleContext(blocks, assetUrls, user));
    return NextResponse.json({ html });
  } catch (e) {
    return apiError(e);
  }
}
