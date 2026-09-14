import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await db.client.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const body = await req.json();
    await db.client.update({
      where: { id },
      data: {
        name: String(body.name || existing.name).trim(),
        address: String(body.address || "").trim() || null,
        phone: String(body.phone || "").trim() || null,
        email: String(body.email || "").trim().toLowerCase() || null,
        gstin: String(body.gstin || "").trim() || null,
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
    const existing = await db.client.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    await db.client.delete({ where: { id } }); // bills keep clientName snapshot, clientId becomes null
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
