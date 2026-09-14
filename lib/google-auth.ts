import crypto from "crypto";

export interface GoogleUserProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CLIENT_ID.trim().length > 0 &&
      process.env.GOOGLE_CLIENT_SECRET.trim().length > 0
  );
}

export function getGoogleOAuthRedirectUri(origin: string): string {
  // If configured in env, prioritize it; otherwise use incoming request origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
  return `${baseUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

/**
 * Generates the Google OAuth 2.0 consent URL and CSRF state token.
 */
export function buildGoogleAuthUrl(
  origin: string,
  statePayload?: { csrf: string; redirectUrl?: string; linkUserId?: string }
): { url: string; state: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const redirectUri = getGoogleOAuthRedirectUri(origin);
  const state = statePayload
    ? Buffer.from(JSON.stringify(statePayload)).toString("base64url")
    : crypto.randomBytes(24).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

/**
 * Exchanges the authorization code received from Google for the user's profile.
 */
export async function exchangeGoogleCodeForProfile(
  code: string,
  origin: string
): Promise<GoogleUserProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = getGoogleOAuthRedirectUri(origin);

  // 1. Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange Google authorization code");
  }

  // 2. Fetch user profile with the access token
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error("Failed to fetch user profile from Google");
  }

  const profile: GoogleUserProfile = await userRes.json();
  if (!profile.email) {
    throw new Error("No email returned by Google account");
  }

  return profile;
}
