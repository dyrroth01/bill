import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

export const SESSION_COOKIE = "bf_session";
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim() === "" || secret === "billflow-dev-secret-change-me") {
    throw new Error(
      "FATAL: AUTH_SECRET environment variable is missing, empty, or set to insecure default. Please configure a secure AUTH_SECRET."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  try {
    return await db.user.findUnique({ where: { id: userId } });
  } catch {
    return null;
  }
}

/** For API routes: returns the user or throws a Response-ish error object. */
export class UnauthorizedError extends Error {}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError("Not signed in");
  return user;
}
