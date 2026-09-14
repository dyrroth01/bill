import { clearSessionCookie } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
