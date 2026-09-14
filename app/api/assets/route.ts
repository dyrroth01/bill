import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { extFromMime, sanitizeExt, saveUpload } from "@/lib/assets";

const ALLOWED_ASSET_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "image");

    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > 15 * 1024 * 1024)
      return NextResponse.json({ error: "File too large (max 15 MB)" }, { status: 400 });

    const mimeType = (file.type || "").toLowerCase();
    if (!ALLOWED_ASSET_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and GIF images are permitted." },
        { status: 400 }
      );
    }

    const isPro = user.plan === "pro";
    const { getUserStorageBytes, FREE_LIMITS, PRO_LIMITS } = await import("@/lib/quotas");
    const currentStorage = await getUserStorageBytes(user.id);
    const maxStorage = isPro ? PRO_LIMITS.maxStorageBytes : FREE_LIMITS.maxStorageBytes;
    if (currentStorage + file.size > maxStorage) {
      return NextResponse.json(
        {
          error: isPro
            ? "Storage limit reached (10 GB max)."
            : "Cloud storage limit reached (500 MB max). Upgrade to Pro for $5/month to get 10 GB cloud storage.",
          quotaExceeded: "storage",
        },
        { status: 403 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = sanitizeExt(extFromMime(file.type || "", file.name));
    const rel = await saveUpload(user.id, "assets", ext, bytes);
    const asset = await db.asset.create({
      data: { userId: user.id, kind, filePath: rel, mimeType: file.type || "application/octet-stream" },
    });
    return NextResponse.json({ id: asset.id, url: `/api/assets/${asset.id}` });
  } catch (e) {
    return apiError(e);
  }
}
