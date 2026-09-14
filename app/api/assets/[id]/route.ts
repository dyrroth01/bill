import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { readUpload } from "@/lib/assets";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const asset = await db.asset.findFirst({ where: { id, userId: user.id } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const buf = await readUpload(asset.filePath);
    const isSafeImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(asset.mimeType.toLowerCase());
    const disposition = isSafeImage ? 'inline; filename="asset"' : 'attachment; filename="asset.bin"';

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": disposition,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
