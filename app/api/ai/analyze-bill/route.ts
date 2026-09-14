import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { prepareSourceImage, cropNormalized } from "@/lib/ai-media";
import { saveUpload } from "@/lib/assets";
import { analyzeBillImage, resolveGeminiKey } from "@/lib/gemini";
import { extFromMime, sanitizeExt } from "@/lib/assets";

function detectMagicMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // PDF: %PDF-
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }
  // WebP: RIFF....WEBP
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Step 1 of the AI Bill Maker: analyze a bill photo/PDF.
 * Returns structured metadata + cropped logo/signature assets when detected.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const isPro = user.plan === "pro";
    if (!isPro && (user.aiGenerationsUsed || 0) >= 5) {
      return NextResponse.json(
        {
          error: "You have reached the 5 free AI template generation limit. Upgrade to Pro for $5/month for unlimited AI templates and 10GB cloud storage.",
          quotaExceeded: "ai_generations",
        },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024)
      return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedMime = detectMagicMime(bytes);
    if (!detectedMime) {
      return NextResponse.json(
        { error: "Invalid file content. Uploaded file must be a genuine JPEG, PNG, WebP image, or PDF document." },
        { status: 400 }
      );
    }

    const mime = detectedMime;
    const prepared = await prepareSourceImage(bytes, mime);

    // keep the source for later (pass 2 + re-crop)
    const srcExt = mime === "application/pdf" ? "png" : sanitizeExt(extFromMime(mime, file.name));
    const srcRel = await saveUpload(user.id, "sources", srcExt, prepared.original);
    const sourceAsset = await db.asset.create({
      data: { userId: user.id, kind: "source", filePath: srcRel, mimeType: mime === "application/pdf" ? "image/png" : mime },
    });

    const key = resolveGeminiKey();
    const analysis = await analyzeBillImage(key, prepared.base64, prepared.mime);

    // crop detected logo/signature for human review
    let logoAssetId: string | null = null;
    let signatureAssetId: string | null = null;
    if (analysis.flags.hasLogo && analysis.crops?.logo) {
      try {
        const png = await cropNormalized(prepared.original, analysis.crops.logo);
        const rel = await saveUpload(user.id, "assets", "png", png);
        const asset = await db.asset.create({ data: { userId: user.id, kind: "logo", filePath: rel, mimeType: "image/png" } });
        logoAssetId = asset.id;
      } catch (e) {
        console.error("logo crop failed", e);
      }
    }
    if (analysis.flags.hasSignature && analysis.crops?.signature) {
      try {
        const png = await cropNormalized(prepared.original, analysis.crops.signature);
        const rel = await saveUpload(user.id, "assets", "png", png);
        const asset = await db.asset.create({ data: { userId: user.id, kind: "signature", filePath: rel, mimeType: "image/png" } });
        signatureAssetId = asset.id;
      } catch (e) {
        console.error("signature crop failed", e);
      }
    }

    return NextResponse.json({
      analysis,
      sourceAssetId: sourceAsset.id,
      logoAssetId,
      signatureAssetId,
      mock: !key,
    });
  } catch (e) {
    return apiError(e);
  }
}
