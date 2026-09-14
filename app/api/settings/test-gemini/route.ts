import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { GoogleGenAI } from "@google/genai";

/** Quick check that a Gemini key works. */
export async function POST() {
  try {
    const user = await requireUser();
    const key = (process.env.GEMINI_API_KEY || "").trim();
    if (!key) return NextResponse.json({ error: "No server Gemini API key configured" }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey: key });
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const res = await ai.models.generateContent({
      model,
      contents: "Reply with exactly: OK",
      config: { maxOutputTokens: 2000 },
    });
    const text = (res.text || "").trim();
    return NextResponse.json({ ok: true, msg: `Key works with model ${model}. Response: "${text.slice(0, 20)}"` });
  } catch (e) {
    return apiError(e);
  }
}
