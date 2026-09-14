import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Verified webhook handler for payment providers (e.g. Stripe, Razorpay, LemonSqueezy).
 * Requires cryptographic signature verification before applying plan tier changes.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-subscription-signature") || req.headers.get("x-webhook-signature");

    const webhookSecret = process.env.SUBSCRIPTION_WEBHOOK_SECRET || process.env.AUTH_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Webhook secret is not configured on server" },
        { status: 500 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        { error: "Missing signature header (x-subscription-signature)" },
        { status: 401 }
      );
    }

    // Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return NextResponse.json(
        { error: "Invalid cryptographic signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const { event, userId, plan } = payload;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Invalid userId in webhook payload" }, { status: 400 });
    }

    const targetPlan = plan === "pro" ? "pro" : "free";

    if (event === "payment.completed" || event === "subscription.activated" || event === "invoice.paid") {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      await db.user.update({
        where: { id: userId },
        data: {
          plan: targetPlan,
          planSubscribedAt: targetPlan === "pro" ? new Date() : null,
        },
      });

      return NextResponse.json({
        ok: true,
        message: `User plan successfully updated to ${targetPlan}`,
      });
    }

    return NextResponse.json({ ok: true, message: "Ignored unhandled event" });
  } catch (e) {
    return apiError(e);
  }
}
