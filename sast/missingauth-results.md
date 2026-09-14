# Missing Authentication & Authorization Analysis Results: BillFlow

## Executive Summary
- Endpoints analyzed: 28
- Vulnerable: 3
- Likely Vulnerable: 1
- Not Vulnerable: 24
- Needs Manual Review: 0

## Findings

### [VULNERABLE] Verification Code Leakage in API Response (Authentication Bypass)
- **File**: `app/api/auth/signup/route.ts` (lines 64-72), `app/api/auth/resend-code/route.ts` (lines 48-55), `lib/email.ts` (lines 58-76)
- **Endpoint / function**: `POST /api/auth/signup`, `POST /api/auth/resend-code`
- **Issue**:
  When `RESEND_API_KEY` is not configured, or when the Resend email service encounters an error or network timeout, `sendVerificationEmail` falls back to development/demo mode and returns the plaintext 6-digit verification code in its return value:
  ```ts
  // lib/email.ts:
  logCodeToConsole(email, code);
  return { success: true, devCode: code };
  ```
  Both `POST /api/auth/signup` and `POST /api/auth/resend-code` directly echo this code back to the client in the HTTP response body:
  ```ts
  // app/api/auth/signup/route.ts:
  return NextResponse.json({
    ok: true,
    requiresVerification: true,
    email,
    devCode: emailResult.devCode,
  });
  ```
- **Taint trace**:
  1. An attacker calls `POST /api/auth/signup` with any victim email address (e.g. `victim@example.com`).
  2. The server creates an unverified user and generates a 6-digit code.
  3. If Resend is not configured (or fails), the server returns `{"ok":true,"email":"victim@example.com","devCode":"491823"}`.
  4. The attacker immediately submits the returned `devCode` to `POST /api/auth/verify-code`.
  5. The server marks the account as verified and issues a valid session cookie for that email.
- **Impact**: Critical Authentication Bypass. Complete account takeover / illegitimate account creation under any arbitrary email without access to the actual email inbox.
- **Remediation**:
  Never return verification codes, tokens, or one-time passwords in client-facing API responses, regardless of environment. Only log to secure server logs during local development (`process.env.NODE_ENV !== "production"`).
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"name":"Victim","email":"admin@targetcorp.com","password":"Password123!"}'
  # Inspect response JSON for "devCode" key.
  ```

### [VULNERABLE] Missing Rate Limiting and Brute-Force Protection on Verification Codes
- **File**: `app/api/auth/verify-code/route.ts` (lines 9-36)
- **Endpoint / function**: `POST /api/auth/verify-code`
- **Issue**:
  The 6-digit verification code is a numeric value between 100000 and 999999 (900,000 possibilities) valid for 10 minutes (600 seconds).
  There is NO attempt tracking, failed attempt counter, lockout mechanism, or rate limiting on the `POST /api/auth/verify-code` endpoint.
  An attacker can send requests in a rapid loop (e.g. 1,000–3,000 requests/second from a local script or modest botnet) to guess the verification code before the 10-minute expiry.
- **Taint trace**:
  Multiple concurrent calls to `POST /api/auth/verify-code` with incrementing `code` values until HTTP 200 is returned.
- **Impact**: Authentication bypass via verification code brute-forcing.
- **Remediation**:
  1. Add an `attempts` counter to the `VerificationCode` table; invalidate the code after 5 failed attempts.
  2. Implement IP and email-based rate limiting on `POST /api/auth/verify-code` (e.g., max 5 attempts per minute).
- **Dynamic Test**:
  ```bash
  # Rapidly test multiple codes against /api/auth/verify-code; verify no 429 Too Many Requests is returned
  for i in {100000..100010}; do
    curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/verify-code \
      -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"code\":\"$i\"}"
  done
  ```

### [VULNERABLE] Cryptographically Insecure PRNG for Verification Codes
- **File**: `lib/email.ts` (lines 7-10)
- **Endpoint / function**: `generateVerificationCode()`
- **Issue**:
  The function uses `Math.random()` to generate verification codes:
  ```ts
  export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  ```
  In Node.js / V8, `Math.random()` uses the XorShift128+ pseudo-random number generator, which is not cryptographically secure. By observing several outputs from `Math.random()`, the internal 128-bit state of the PRNG can be mathematically reconstructed to predict past and future verification codes.
- **Impact**: Predictability of verification codes, allowing attackers to deduce valid codes for other users.
- **Remediation**:
  Use `crypto.randomInt`:
  ```ts
  import crypto from "crypto";
  export function generateVerificationCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }
  ```

### [LIKELY VULNERABLE] Missing Rate Limiting on Credential Login
- **File**: `app/api/auth/login/route.ts` (lines 6-32)
- **Endpoint / function**: `POST /api/auth/login`
- **Issue**:
  No rate limiting or progressive delay exists on the password authentication route, enabling offline or online brute-force credential stuffing attacks against user accounts.
- **Remediation**: Implement rate limiting per IP and per account (e.g. max 5 failed attempts per 15 minutes).

### [NOT VULNERABLE] Enforced Authentication on Protected REST Routes
- **File**: `app/api/bills/**`, `app/api/clients/**`, `app/api/templates/**`, `app/api/assets/**`, `app/api/settings/**`, `app/api/subscription/**`
- **Endpoint / function**: All private business endpoints
- **Reason**: Every private API route invokes `await requireUser()`, which extracts the session cookie, validates the JWT with `jwtVerify`, looks up the user in the database, and throws `UnauthorizedError` (mapped to HTTP 401) if not authenticated.
