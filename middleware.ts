import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim() === "" || secret === "billflow-dev-secret-change-me") {
    throw new Error("AUTH_SECRET is missing or insecure in middleware.");
  }
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("bf_session")?.value;
  let authed = false;
  if (token) {
    try {
      await jwtVerify(token, getSecret());
      authed = true;
    } catch {}
  }
  if (!authed) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/welcome",
    "/dashboard/:path*",
    "/bills/:path*",
    "/templates/:path*",
    "/clients/:path*",
    "/settings/:path*",
  ],
};
