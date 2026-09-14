import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const clients = await db.client.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      include: { bills: { select: { total: true, status: true, dueDate: true } } },
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Client name is required" }, { status: 400 });
    const client = await db.client.create({
      data: {
        userId: user.id,
        name,
        address: String(body.address || "").trim() || null,
        phone: String(body.phone || "").trim() || null,
        email: String(body.email || "").trim().toLowerCase() || null,
        gstin: String(body.gstin || "").trim() || null,
      },
    });
    return NextResponse.json({ id: client.id });
  } catch (e) {
    return apiError(e);
  }
}
