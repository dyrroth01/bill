import { NextResponse } from "next/server";
import { requireUser, getSessionUser } from "@/lib/auth";
import { apiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ user: null }, { status: 200 });
    const { getUserUsage } = await import("@/lib/quotas");
    const usage = await getUserUsage(user.id);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        onboardingDone: user.onboardingDone,
        aiEnabled: Boolean(process.env.GEMINI_API_KEY),
        plan: usage.plan,
        isPro: usage.isPro,
        showAds: usage.showAds,
        aiGenerationsUsed: usage.aiGenerationsUsed,
        maxAiGenerations: usage.maxAiGenerations,
        aiGenerationsRemaining: usage.aiGenerationsRemaining,
        billsCount: usage.billsCount,
        maxBills: usage.maxBills,
        billsRemaining: usage.billsRemaining,
        storageBytes: usage.storageBytes,
        maxStorageBytes: usage.maxStorageBytes,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST() {
  // Mark onboarding complete (welcome screen visited)
  try {
    const user = await requireUser();
    const { db } = await import("@/lib/db");
    await db.user.update({ where: { id: user.id }, data: { onboardingDone: true } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
