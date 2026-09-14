import crypto from "crypto";

function getShareSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim() === "" || secret === "billflow-dev-secret" || secret === "billflow-dev-secret-change-me") {
    throw new Error("AUTH_SECRET is missing or insecure for signing tokens.");
  }
  return secret;
}

/** Short-lived signed URLs so the mobile app can open bill PDFs without a session cookie. */
export function signBillPdfToken(billId: string, exp: number): string {
  return crypto
    .createHmac("sha256", getShareSecret())
    .update(`${billId}.${exp}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyBillPdfToken(billId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  try {
    const expected = signBillPdfToken(billId, exp);
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
