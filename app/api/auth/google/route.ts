import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildGoogleAuthUrl, isGoogleAuthConfigured, getGoogleOAuthRedirectUri } from "@/lib/google-auth";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const rawRedirectUrl = req.nextUrl.searchParams.get("redirect_url");
  const isLinkRequest = req.nextUrl.searchParams.get("link") === "true";
  const sessionUserId = await getSessionUserId();

  // Validate redirect_url to prevent open redirect vulnerabilities
  let validatedRedirectUrl: string | undefined = undefined;
  if (rawRedirectUrl) {
    const trimmed = rawRedirectUrl.trim();
    if (
      trimmed.startsWith("mobile://") ||
      trimmed.startsWith("exp://") ||
      trimmed.startsWith("/") ||
      (trimmed.startsWith("http") && new URL(trimmed).origin === origin)
    ) {
      validatedRedirectUrl = trimmed;
    }
  }

  // If Google OAuth credentials are not yet set in .env, display a helpful guide
  if (!isGoogleAuthConfigured()) {
    if (req.nextUrl.searchParams.get("format") === "json" || req.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json(
        { error: "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env." },
        { status: 503 }
      );
    }
    const redirectUri = getGoogleOAuthRedirectUri(origin);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Google Sign-In Configuration Required - BillFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px 20px; line-height: 1.6; }
    .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); }
    h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 0; }
    .badge { display: inline-block; background: #e0e7ff; color: #4338ca; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; margin-bottom: 12px; }
    ol { padding-left: 20px; margin: 16px 0; }
    li { margin-bottom: 12px; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; font-size: 13px; font-family: monospace; color: #475569; }
    pre { background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 10px; font-size: 13px; overflow-x: auto; font-family: monospace; }
    .btn { display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700; padding: 10px 18px; border-radius: 10px; font-size: 14px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Google Sign-In Setup</div>
    <h1>Connect Google OAuth Credentials</h1>
    <p>You have already registered the redirect URI in Google Cloud. Now your app needs the <strong>Client ID</strong> and <strong>Client Secret</strong> to communicate with Google:</p>
    
    <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 14px 16px; margin: 16px 0;">
      <strong style="color: #312e81; font-size: 15px;">🚀 If your app is hosted on Vercel:</strong>
      <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13.5px;">
        <li>Open your project at <a href="https://vercel.com/dashboard" target="_blank" style="color: #4f46e5; font-weight: 600;">Vercel Dashboard</a>.</li>
        <li>Go to <strong>Settings</strong> &rarr; <strong>Environment Variables</strong>.</li>
        <li>Add <code>GOOGLE_CLIENT_ID</code> (ends in <code>.apps.googleusercontent.com</code>).</li>
        <li>Add <code>GOOGLE_CLIENT_SECRET</code>.</li>
        <li>Go to <strong>Deployments</strong>, click the three dots &ldquo;...&rdquo; on the latest deployment, and click <strong>Redeploy</strong>.</li>
      </ol>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 16px 0;">
      <strong style="color: #334155; font-size: 15px;">💻 If running locally (localhost):</strong>
      <p style="margin: 6px 0 0 0; font-size: 13.5px;">Add them to your local <code>.env</code> file and restart <code>npm run dev</code>.</p>
    </div>

    <pre>GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"</pre>

    <a href="/login" class="btn">&larr; Back to Login</a>
  </div>
</body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const csrfToken = crypto.randomBytes(24).toString("hex");
  const statePayload: { csrf: string; redirectUrl?: string; linkUserId?: string } = {
    csrf: csrfToken,
    redirectUrl: validatedRedirectUrl,
    linkUserId: (isLinkRequest || sessionUserId) ? sessionUserId ?? undefined : undefined,
  };
  const { url } = buildGoogleAuthUrl(origin, statePayload);

  // Store CSRF state token in an httpOnly cookie for 10 minutes
  const cookieStore = await cookies();
  cookieStore.set("bf_oauth_state", csrfToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60, // 10 minutes
    path: "/",
  });

  return NextResponse.redirect(url);
}
