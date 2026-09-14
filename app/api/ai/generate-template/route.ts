import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, parseFields } from "@/lib/api";
import { generateTemplateHtml, resolveGeminiKey } from "@/lib/gemini";
import { readUpload, fileToDataUrl } from "@/lib/assets";
import { DEFAULT_BLOCKS, type BillAnalysis } from "@/lib/types";

/**
 * Step 2 of the AI Bill Maker: generate the reusable HTML template
 * from the analysis + source image, and save it as a Template.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const isPro = user.plan === "pro";
    if (!isPro && (user.aiGenerationsUsed || 0) >= 5) {
      return NextResponse.json(
        {
          error: "You have used all 5 free AI template generations. Upgrade to Pro for $5/month for unlimited AI templates and 10GB cloud storage.",
          quotaExceeded: "ai_generations",
        },
        { status: 403 }
      );
    }

    const body = await req.json();

    const analysis: BillAnalysis = {
      ...(body.analysis || {}),
      flags: { ...DEFAULT_BLOCKS, ...((body.analysis || {}).flags || {}) },
      fields: parseFields(JSON.stringify((body.analysis || {}).fields || [])),
    };
    const pageFormat: "A4" | "A5" = body.pageFormat === "A4" ? "A4" : "A5";

    let imageBase64 = "";
    let imageMime = "image/jpeg";
    if (body.sourceAssetId) {
      const asset = await db.asset.findFirst({ where: { id: body.sourceAssetId, userId: user.id } });
      if (asset) {
        try {
          imageBase64 = (await readUpload(asset.filePath)).toString("base64");
          imageMime = asset.mimeType || "image/png";
        } catch {}
      }
    }

    const key = resolveGeminiKey();
    const html = await generateTemplateHtml(key, imageBase64, imageMime, analysis, pageFormat);

    // Track AI generation usage on Free tier
    if (!isPro) {
      await db.user.update({
        where: { id: user.id },
        data: { aiGenerationsUsed: { increment: 1 } },
      });
    }

    const name = String(body.name || analysis.businessName || "My Bill Template").slice(0, 120);
    const created = await db.template.create({
      data: {
        userId: user.id,
        name,
        description: analysis.mock
          ? "Created without AI processing (fallback layout)."
          : `Generated with AI Bill Maker on ${new Date().toLocaleDateString("en-IN")}.`,
        sourceType: "ai",
        html,
        fieldSchema: JSON.stringify(analysis.fields || []),
        blocks: JSON.stringify(analysis.flags),
        pageFormat,
        logoAssetId: body.logoAssetId || null,
        signatureAssetId: body.signatureAssetId || null,
      },
    });

    // prepare a sample preview for the review screen
    const { buildSampleContext } = await import("@/lib/sample-data");
    const { renderBillTemplate } = await import("@/lib/template-engine");
    const assetUrls: Record<string, string> = {};
    for (const [k, assetId] of [
      ["logoUrl", body.logoAssetId],
      ["signatureUrl", body.signatureAssetId],
    ] as const) {
      if (assetId) {
        const asset = await db.asset.findFirst({ where: { id: assetId, userId: user.id } });
        if (asset) {
          try {
            assetUrls[k] = await fileToDataUrl(asset.filePath, asset.mimeType);
          } catch {}
        }
      }
    }
    const previewHtml = renderBillTemplate(html, buildSampleContext(analysis.flags, assetUrls, user));

    return NextResponse.json({ id: created.id, previewHtml, mock: !key });
  } catch (e) {
    return apiError(e);
  }
}
