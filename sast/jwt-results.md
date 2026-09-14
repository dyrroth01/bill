# JWT & Cryptographic Token Analysis Results: BillFlow

## Executive Summary
- Token mechanisms analyzed: 2
- Vulnerable: 2
- Likely Vulnerable: 0
- Not Vulnerable: 3
- Needs Manual Review: 0

## Findings

### [VULNERABLE] Insecure Hardcoded Fallback Secrets for Session JWT and HMAC Share Tokens
- **File**: `lib/auth.ts` (lines 9-12), `middleware.ts` (line 4), `lib/share-token.ts` (lines 4-10)
- **Endpoint / function**: Session verification (`getSessionUserId`), Edge middleware (`middleware`), PDF signed token generation and validation (`signBillPdfToken`, `verifyBillPdfToken`)
- **Issue**:
  The application provides default hardcoded strings if `process.env.AUTH_SECRET` is unset:
  1. `lib/auth.ts`:
     ```ts
     function secretKey(): Uint8Array {
       const secret = process.env.AUTH_SECRET || "billflow-dev-secret-change-me";
       return new TextEncoder().encode(secret);
     }
     ```
  2. `middleware.ts`:
     ```ts
     const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "billflow-dev-secret-change-me");
     ```
  3. `lib/share-token.ts`:
     ```ts
     crypto.createHmac("sha256", process.env.AUTH_SECRET || "billflow-dev-secret")
     ```
  If the application is deployed into any environment where `AUTH_SECRET` is missing or accidentally omitted, the application silently falls back to these well-known static secrets.
- **Taint trace**:
  An attacker signs a JWT payload `{"sub": "<target_user_id>", "exp": 1999999999}` using HS256 and key `"billflow-dev-secret-change-me"`.
  When sent via cookie `bf_session`, `jwtVerify(token, secretKey())` validates successfully and the attacker is authenticated as `target_user_id`.
- **Impact**: Full authentication bypass and account takeover of any user in environments where `AUTH_SECRET` is not set.
- **Remediation**:
  Fail fast on server startup if `AUTH_SECRET` is not configured:
  ```ts
  if (!process.env.AUTH_SECRET) {
    throw new Error("FATAL: AUTH_SECRET environment variable must be set.");
  }
  ```
- **Dynamic Test**:
  ```bash
  # Sign a JWT with 'billflow-dev-secret-change-me' and test access
  curl -X GET http://localhost:3000/api/auth/me \
    -H "Cookie: bf_session=<FORGED_JWT>"
  ```

### [VULNERABLE] Secret Inconsistency Between Modules
- **File**: `lib/auth.ts` (line 10) vs `lib/share-token.ts` (line 6)
- **Endpoint / function**: `signBillPdfToken` vs `createSessionToken`
- **Issue**:
  `lib/auth.ts` defaults to `"billflow-dev-secret-change-me"`, while `lib/share-token.ts` defaults to `"billflow-dev-secret"`. This demonstrates uncoordinated cryptographic key management across application modules.
- **Remediation**: Centralize secret retrieval in a single configuration helper and throw an error when missing.

### [NOT VULNERABLE] Algorithm Confusion / None Algorithm Prevented
- **File**: `lib/auth.ts` (line 24), `lib/auth.ts` (line 52)
- **Endpoint / function**: `jwtVerify` via `jose`
- **Reason**: The application uses the `jose` library with explicit algorithm binding (`alg: "HS256"`). The `jose` library strictly rejects `alg: "none"` and prevents RS256/HS256 key confusion attacks.

### [NOT VULNERABLE] Constant-Time Signature Comparison
- **File**: `lib/share-token.ts` (line 15)
- **Endpoint / function**: `verifyBillPdfToken()`
- **Reason**: Signatures are compared using `crypto.timingSafeEqual()`, mitigating timing attacks during token verification.
