import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { setSessionCookie, createSessionToken } from "@/lib/auth";
import { exchangeGoogleCodeForProfile } from "@/lib/google-auth";
import { BUILTIN_TEMPLATES } from "@/lib/builtin-templates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const error = sp.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("bf_oauth_state")?.value;
  cookieStore.set("bf_oauth_state", "", { maxAge: 0, path: "/" });

  // Decode state payload to support mobile deep links and account linking
  let csrfToken = state || "";
  let mobileRedirectUrl: string | null = null;
  let linkUserId: string | null = null;
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
      if (decoded && typeof decoded.csrf === "string") {
        csrfToken = decoded.csrf;
        if (decoded.redirectUrl && typeof decoded.redirectUrl === "string") {
          const rUrl = decoded.redirectUrl.trim();
          if (
            rUrl.startsWith("mobile://") ||
            rUrl.startsWith("exp://") ||
            rUrl.startsWith("/") ||
            (rUrl.startsWith("http") && new URL(rUrl).origin === origin)
          ) {
            mobileRedirectUrl = rUrl;
          }
        }
        if (decoded.linkUserId && typeof decoded.linkUserId === "string") {
          linkUserId = decoded.linkUserId;
        }
      }
    } catch {
      csrfToken = state;
    }
  }

  if (error) {
    console.warn("Google OAuth canceled or errored:", error);
    if (mobileRedirectUrl) {
      const sep = mobileRedirectUrl.includes("?") ? "&" : "?";
      return NextResponse.redirect(
        `${mobileRedirectUrl}${sep}error=${encodeURIComponent("Google authentication was cancelled.")}`
      );
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Google authentication was cancelled.")}`);
  }

  if (!code || !csrfToken || (savedState && csrfToken !== savedState)) {
    if (mobileRedirectUrl) {
      const sep = mobileRedirectUrl.includes("?") ? "&" : "?";
      return NextResponse.redirect(
        `${mobileRedirectUrl}${sep}error=${encodeURIComponent("Invalid or expired authentication session. Please try again.")}`
      );
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Invalid or expired authentication session. Please try again.")}`
    );
  }

  try {
    const profile = await exchangeGoogleCodeForProfile(code, origin);
    const email = profile.email.toLowerCase();

    // 0. If this is an authenticated account linking request:
    if (linkUserId) {
      const existingGoogleUser = await db.user.findFirst({
        where: {
          googleId: profile.id,
          NOT: { id: linkUserId },
        },
      });

      if (existingGoogleUser) {
        return NextResponse.redirect(
          `${origin}/settings?error=${encodeURIComponent(
            "This Google account is already linked to another BillFlow account."
          )}`
        );
      }

      await db.user.update({
        where: { id: linkUserId },
        data: {
          googleId: profile.id,
          emailVerified: true,
          avatarUrl: profile.picture || undefined,
        },
      });

      return NextResponse.redirect(`${origin}/settings?linked=google`);
    }

    // 1. Check if user already exists with this googleId or email
    let user = await db.user.findFirst({
      where: {
        OR: [{ googleId: profile.id }, { email }],
      },
    });

    if (user) {
      // Update googleId, avatar, and verify email
      user = await db.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.id,
          emailVerified: true,
          avatarUrl: profile.picture || user.avatarUrl,
        },
      });
    } else {
      // 2. Create new user with verified email
      const newUser = await db.user.create({
        data: {
          name: profile.name || email.split("@")[0],
          email,
          googleId: profile.id,
          emailVerified: true,
          avatarUrl: profile.picture || null,
        },
      });
      user = newUser;

      // Seed starter templates so the new user can bill immediately
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

    if (!user) {
      throw new Error("Unable to establish user session");
    }

    // Set session cookie
    await setSessionCookie(user.id);
    const sessionToken = await createSessionToken(user.id);

    // If request originated from mobile app, redirect to mobile deep link with token
    if (mobileRedirectUrl) {
      const sep = mobileRedirectUrl.includes("?") ? "&" : "?";
      return NextResponse.redirect(
        `${mobileRedirectUrl}${sep}token=${encodeURIComponent(sessionToken)}&onboardingDone=${user.onboardingDone}`
      );
    }

    // Redirect to welcome/onboarding if not completed, otherwise dashboard
    const targetUrl = user.onboardingDone ? `${origin}/dashboard` : `${origin}/welcome`;
    return NextResponse.redirect(targetUrl);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    const msg = err instanceof Error ? err.message : "Failed to sign in with Google";
    if (mobileRedirectUrl) {
      const sep = mobileRedirectUrl.includes("?") ? "&" : "?";
      return NextResponse.redirect(`${mobileRedirectUrl}${sep}error=${encodeURIComponent(msg)}`);
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  }
}
