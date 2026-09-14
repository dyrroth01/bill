import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getUserUsage, FREE_LIMITS, PRO_LIMITS } from "@/lib/quotas";

export async function GET() {
  try {
    const user = await requireUser();
    const usage = await getUserUsage(user.id);
    return NextResponse.json({
      usage,
      tiers: {
        free: FREE_LIMITS,
        pro: PRO_LIMITS,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    if (body.plan === "pro") {
      return NextResponse.json(
        {
          error:
            "Direct plan escalation is not permitted. Pro upgrades require verified checkout and payment gateway processing.",
        },
        { status: 402 }
      );
    }

    // Allow user-initiated cancellation / downgrade to free plan
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        plan: "free",
        planSubscribedAt: null,
      },
    });

    const usage = await getUserUsage(updated.id);

    return NextResponse.json({
      ok: true,
      message: "Plan switched to Freemium.",
      usage,
    });
  } catch (e) {
    return apiError(e);
  }
}
