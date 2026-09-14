import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSessionCookie, createSessionToken } from "@/lib/auth";
import { BUILTIN_TEMPLATES } from "@/lib/builtin-templates";

export const dynamic = "force-dynamic";

interface GoogleTokenInfo {
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  aud?: string;
  error_description?: string;
  error?: string;
}

/**
 * Native Android/iOS Google Sign-In endpoint.
 * Accepts a Google idToken directly from Google Play Services on mobile,
 * verifies it with Google, and links or logs into the user's account by email.
 *
 * All data (bills, clients, templates) generated on the website or mobile
 * automatically syncs because it is tied to the same user account.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { idToken } = body;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { error: "Missing required idToken parameter" },
        { status: 400 }
      );
    }

    // Verify token with Google's tokeninfo API
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );

    if (!verifyRes.ok) {
      const errData: GoogleTokenInfo = await verifyRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            errData.error_description ||
            errData.error ||
            "Invalid Google credentials or expired token",
        },
        { status: 401 }
      );
    }

    const payload: GoogleTokenInfo = await verifyRes.json();

    if (!payload.sub || !payload.email) {
      return NextResponse.json(
        { error: "Google account did not return an email or identifier" },
        { status: 400 }
      );
    }

    const email = payload.email.toLowerCase().trim();
    const isEmailVerified =
      payload.email_verified === "true" || payload.email_verified === true;

    if (!isEmailVerified) {
      return NextResponse.json(
        { error: "Google account email is not verified" },
        { status: 403 }
      );
    }

    const webClientId = process.env.GOOGLE_CLIENT_ID;
    const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
    if (payload.aud && (webClientId || androidClientId)) {
      const allowedAuds = [webClientId, androidClientId].filter(Boolean);
      if (!allowedAuds.includes(payload.aud)) {
        return NextResponse.json(
          { error: "Token was not issued for this application" },
          { status: 403 }
        );
      }
    }

    // 1. Look for existing user with this googleId or email (ensures website + mobile sync)
    let user = await db.user.findFirst({
      where: {
        OR: [{ googleId: payload.sub }, { email }],
      },
    });

    if (user) {
      // User already exists (e.g. registered or created bills on the website)
      user = await db.user.update({
        where: { id: user.id },
        data: {
          googleId: payload.sub,
          emailVerified: true,
          avatarUrl: payload.picture || user.avatarUrl,
        },
      });
    } else {
      // 2. First-time user: create new account with verified email
      const newUser = await db.user.create({
        data: {
          name: payload.name || email.split("@")[0],
          email,
          googleId: payload.sub,
          emailVerified: true,
          avatarUrl: payload.picture || null,
        },
      });
      user = newUser;

      // Seed starter templates so they can start billing immediately
      await db.template.createMany({
        data: BUILTIN_TEMPLATES.map((t) => ({
          userId: newUser.id,
          name: t.name,
          description: t.description,
          sourceType: "builtin",
          html: t.html,
          fieldSchema: JSON.stringify(t.fields),
          blocks: JSON.stringify(t.blocks),
          pageFormat: t.pageFormat,
        })),
      });
    }

    // Generate authenticated session token
    await setSessionCookie(user.id);
    const sessionToken = await createSessionToken(user.id);

    return NextResponse.json({
      success: true,
      token: sessionToken,
      onboardingDone: user.onboardingDone,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        onboardingDone: user.onboardingDone,
        plan: user.plan,
      },
    });
  } catch (err: any) {
    console.error("Native Google auth error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during Google Sign-In",
      },
      { status: 500 }
    );
  }
}
