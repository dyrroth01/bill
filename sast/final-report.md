# Security Assessment Final Report

**Project**: BillFlow (billing app plus website)
**Generated**: 2026-09-07
**Scans completed**: SQLi, GraphQL, XSS, SSRF, RCE, XXE, File Upload, Path Traversal, SSTI, JWT, Missing Auth, Business Logic, IDOR, Hardcoded Secrets

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High     | 7 |
| Medium   | 7 |
| Low      | 0 |
| **Total confirmed findings** | **18** |

Scans with no confirmed vulnerabilities: SQLi, GraphQL, XXE
Findings requiring manual review: 1 (see `sast/idor-results.md` regarding signed public PDF share tokens)

---

## Vulnerability Index

| # | Title | Type | Severity | Endpoint / File |
|---|-------|------|----------|----------------|
| 1 | Blind / Full-Content SSRF and Local File Disclosure via Headless Chromium | SSRF | Critical | `GET /api/bills/[id]/pdf`, `GET /api/public/bill-pdf` |
| 2 | Verification Code Leakage in API Response (Authentication Bypass) | Missing Auth | Critical | `POST /api/auth/signup`, `POST /api/auth/resend-code` |
| 3 | Insecure Hardcoded Fallback Secrets for Session JWT and HMAC Share Tokens | JWT | Critical | `lib/auth.ts`, `middleware.ts`, `lib/share-token.ts` |
| 4 | Arbitrary Subscription Plan Escalation (Free Pro Upgrade) | Business Logic | Critical | `POST /api/subscription` |
| 5 | Missing Sandboxing on Template Preview iframes (Stored / DOM XSS) | XSS | High | `components/TemplateEditor.tsx`, `components/BillForm.tsx` |
| 6 | Complete Lack of HTML Sanitization on Manual Template Creation | XSS | High | `POST /api/templates`, `PUT /api/templates/[id]` |
| 7 | Ineffective Regex-based Script Stripping in Imported Templates | XSS | High | `POST /api/templates/import`, `lib/ai-media.ts` |
| 8 | Arbitrary Content-Type Storage and Insecure File Serving | File Upload | High | `POST /api/assets`, `GET /api/assets/[id]` |
| 9 | Missing Rate Limiting & Brute-Force Protection on Verification Codes | Missing Auth | High | `POST /api/auth/verify-code` |
| 10 | Live Third-Party API Keys and Credentials in Local `.env` File | Hardcoded Secrets | High | `.env` |
| 11 | Disabling of Chromium Sandboxing in Headless PDF Renderer ⚠ Likely Vulnerable | RCE | High | `lib/pdf.ts` |
| 12 | Pre-Verification Account Takeover / Overwrite | Business Logic | Medium | `POST /api/auth/signup` |
| 13 | Cryptographically Insecure PRNG for Verification Codes | Missing Auth | Medium | `lib/email.ts` |
| 14 | Missing Rate Limiting on Credential Login ⚠ Likely Vulnerable | Missing Auth | Medium | `POST /api/auth/login` |
| 15 | User-Controlled Handlebars Template Compilation ⚠ Likely Vulnerable | SSTI | Medium | `lib/template-engine.ts` |
| 16 | Incomplete Path Containment Verification in `readUpload` ⚠ Likely Vulnerable | Path Traversal | Medium | `lib/assets.ts` |
| 17 | Lack of Strict Magic Byte Validation in AI Bill Upload ⚠ Likely Vulnerable | File Upload | Medium | `POST /api/ai/analyze-bill` |
| 18 | Arbitrary MIME Type and Missing Content-Disposition on Asset Serving ⚠ Likely Vulnerable | XSS | Medium | `GET /api/assets/[id]` |

---

## Findings

### Critical

#### Blind / Full-Content SSRF and Local File Disclosure via Headless Chromium — SSRF

- **Source scan**: `sast/ssrf-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `lib/pdf.ts` (lines 35-44, 57-76), `lib/render-bill.ts` (lines 236-271), `GET /api/bills/[id]/pdf`, `GET /api/public/bill-pdf`
- **Severity rationale**: The headless Chromium renderer operates with user-provided HTML and executes without request interception, enabling attackers to read local server filesystem files (`file:///`) or query private cloud metadata services (`http://169.254.169.254`) and exfiltrate credentials directly in rendered PDF pages.
- **Issue**: Puppeteer is launched without network restrictions, request interception, or protocol filters:
  ```ts
  puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
    ],
  })
  ```
  User-supplied HTML is loaded via `page.setContent(html, { waitUntil: "load" })`. Without `page.setRequestInterception(true)`, Chromium resolves `<iframe src="file:///...">` and internal HTTP addresses and renders them into the final PDF.
- **Impact**: Server file disclosure (`file:///etc/passwd`, Windows system files, `.env` files) and internal cloud metadata credential extraction.
- **Proof**:
  ```html
  <!-- Payload placed inside bill template HTML -->
  <iframe src="http://169.254.169.254/latest/meta-data/" style="width:1000px; height:800px;"></iframe>
  <iframe src="file:///C:/Windows/win.ini" style="width:1000px; height:800px;"></iframe>
  ```
- **Remediation**:
  Enable Puppeteer request interception (`await page.setRequestInterception(true)`) and abort requests targeting non-HTTP protocols (`file:`, `data:`) and private IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`).
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/templates \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"name":"SSRF Test","html":"<html><body><iframe src=\"file:///C:/Windows/win.ini\" style=\"width:800px;height:600px;\"></iframe></body></html>"}'
  ```

#### Verification Code Leakage in API Response (Authentication Bypass) — Missing Auth

- **Source scan**: `sast/missingauth-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `app/api/auth/signup/route.ts` (lines 64-72), `app/api/auth/resend-code/route.ts` (lines 48-55), `lib/email.ts` (lines 58-76)
- **Severity rationale**: This flaw permits unauthenticated attackers to register any email address or trigger verification for an existing account and obtain the valid verification code in the HTTP JSON response, completely bypassing email ownership verification.
- **Issue**:
  When `RESEND_API_KEY` is not set or fails, `sendVerificationEmail()` returns `{ success: true, devCode: code }`. The API route reflects this value in the client response:
  ```ts
  return NextResponse.json({
    ok: true,
    requiresVerification: true,
    email,
    devCode: emailResult.devCode,
  });
  ```
- **Impact**: Immediate account takeover and verification bypass for any registered email.
- **Proof**:
  ```bash
  POST /api/auth/signup
  {"name":"Attacker","email":"victim@example.com","password":"Password123!"}

  HTTP/1.1 200 OK
  {"ok":true,"requiresVerification":true,"email":"victim@example.com","devCode":"582914"}
  ```
- **Remediation**:
  Never return `devCode` in API responses. In development mode, log codes exclusively to stdout on the server.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","email":"target@test.com","password":"Password123!"}'
  ```

#### Insecure Hardcoded Fallback Secrets for Session JWT and HMAC Share Tokens — JWT

- **Source scan**: `sast/jwt-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `lib/auth.ts` (lines 9-12), `middleware.ts` (line 4), `lib/share-token.ts` (lines 4-10)
- **Severity rationale**: If `AUTH_SECRET` is unset, default hardcoded secrets allow attackers to forge valid JWT session cookies for any arbitrary `userId` and bypass authentication across the application.
- **Issue**:
  ```ts
  const secret = process.env.AUTH_SECRET || "billflow-dev-secret-change-me";
  ```
- **Impact**: Full authentication bypass and account takeover.
- **Proof**:
  Forge a session token using HS256 and secret `"billflow-dev-secret-change-me"` with payload `{"sub":"<TARGET_USER_ID>"}`.
- **Remediation**:
  Throw a fatal error during server startup if `AUTH_SECRET` is missing.
- **Dynamic Test**:
  ```bash
  curl -X GET http://localhost:3000/api/auth/me \
    -H "Cookie: bf_session=<FORGED_TOKEN>"
  ```

#### Arbitrary Subscription Plan Escalation (Free Pro Upgrade) — Business Logic

- **Source scan**: `sast/businesslogic-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `app/api/subscription/route.ts` (lines 23-47)
- **Severity rationale**: Complete monetization and tier restriction bypass. Users can upgrade to Pro without payment verification or interaction with a payment processor.
- **Issue**:
  ```ts
  const targetPlan = body.plan === "pro" ? "pro" : "free";
  await db.user.update({
    where: { id: user.id },
    data: { plan: targetPlan, planSubscribedAt: targetPlan === "pro" ? new Date() : null },
  });
  ```
- **Impact**: Unauthorized access to premium features (unlimited bills, 10 GB storage, unlimited AI).
- **Proof**:
  ```bash
  POST /api/subscription
  {"plan":"pro"}

  HTTP/1.1 200 OK
  {"ok":true,"message":"Upgraded to Pro Business Plan ($5/month)!"}
  ```
- **Remediation**: Integrate a verified payment gateway webhook to handle plan tier transitions.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/subscription \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"plan":"pro"}'
  ```

---

### High

#### Missing Sandboxing on Template Preview iframes (Stored / DOM XSS) — XSS

- **Source scan**: `sast/xss-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `components/TemplateEditor.tsx` (line 285), `components/TemplateCardActions.tsx` (line 86), `components/NewTemplateTabs.tsx` (lines 323, 682, 715), `components/BillForm.tsx` (line 1176)
- **Severity rationale**: Untrusted template HTML is rendered inside client iframes via `srcDoc` without a `sandbox` attribute, granting embedded JavaScript full same-origin access to the parent application window.
- **Issue**: `<iframe srcDoc={previewHtml} />` runs in the same origin as the parent page.
- **Impact**: Full execution of JavaScript within the user's session, leading to token exfiltration and state modification.
- **Remediation**: Add `sandbox=""` or `sandbox="allow-modals"` to all preview `<iframe>` tags.
- **Dynamic Test**: Create a template containing `<script>alert(document.domain)</script>` and view preview.

#### Complete Lack of HTML Sanitization on Manual Template Creation — XSS

- **Source scan**: `sast/xss-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `app/api/templates/route.ts` (lines 26-46), `app/api/templates/[id]/route.ts` (lines 32-53)
- **Severity rationale**: Raw HTML strings provided in JSON bodies are persisted directly to the database without sanitization or script stripping.
- **Issue**: `POST /api/templates` accepts raw `body.html` without sanitization.
- **Impact**: Persistent XSS payloads stored in the database.
- **Remediation**: Sanitize HTML before persistence using an allowlist-based sanitizer.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/templates \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"name":"XSS","html":"<script>alert(1)</script>"}'
  ```

#### Ineffective Regex-based Script Stripping in Imported Templates — XSS

- **Source scan**: `sast/xss-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `lib/ai-media.ts` (lines 60-65), `app/api/templates/import/route.ts` (line 27)
- **Severity rationale**: Regex-based script stripping is trivial to bypass using unquoted attributes, slash delimiters, or SVG tags.
- **Issue**: `stripScripts()` only matches quoted `on*=` handlers and simple `<script>` blocks.
- **Impact**: Stored XSS via template imports.
- **Remediation**: Use an established sanitizer such as `sanitize-html` or `DOMPurify`.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/templates/import \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -F "file=@payload.html;type=text/html"
  # Where payload.html contains <img src=x onerror=alert(1)>
  ```

#### Arbitrary Content-Type Storage and Insecure File Serving — File Upload

- **Source scan**: `sast/fileupload-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `app/api/assets/route.ts` (lines 34-40), `app/api/assets/[id]/route.ts` (lines 15-21)
- **Severity rationale**: Any client-specified MIME type (such as `image/svg+xml` or `text/html`) is stored and replayed on download without sanitization or attachment disposition.
- **Issue**: Client-supplied `file.type` is directly used in `Content-Type` header when serving assets.
- **Impact**: Stored XSS when assets are viewed directly in a browser.
- **Remediation**: Restrict uploads to safe raster image formats (`image/jpeg`, `image/png`, `image/webp`) and serve with `X-Content-Type-Options: nosniff`.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/assets \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -F "file=@test.svg;type=image/svg+xml"
  ```

#### Missing Rate Limiting & Brute-Force Protection on Verification Codes — Missing Auth

- **Source scan**: `sast/missingauth-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `app/api/auth/verify-code/route.ts` (lines 9-36)
- **Severity rationale**: 6-digit numeric codes can be brute-forced within the 10-minute validity window due to lack of attempt limits.
- **Issue**: No attempt tracking or rate limiting exists on verification code checks.
- **Impact**: Unauthorized account verification via automated guessing.
- **Remediation**: Invalidate codes after 5 incorrect attempts and apply IP-based rate limiting.
- **Dynamic Test**: Send rapid sequential verification requests to `/api/auth/verify-code`.

#### Live Third-Party API Keys and Credentials in Local `.env` File — Hardcoded Secrets

- **Source scan**: `sast/hardcodedsecrets-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `.env` (lines 5, 9, 15, 16, 21)
- **Severity rationale**: Active third-party API keys (Resend, Google OAuth, Gemini) and static auth secrets are stored in plaintext on disk.
- **Issue**: Live production-capable secrets stored in `.env`.
- **Impact**: Exposure of third-party cloud accounts, billings, and authentication infrastructure.
- **Remediation**: Rotate exposed credentials and configure secret management.

#### Disabling of Chromium Sandboxing in Headless PDF Renderer — RCE ⚠ Likely Vulnerable

- **Source scan**: `sast/rce-results.md`
- **Classification**: Likely Vulnerable
- **Endpoint / File**: `lib/pdf.ts` (lines 36-44)
- **Severity rationale**: Launching Chromium with `--no-sandbox` removes the boundary separating browser renderer vulnerabilities from host operating system compromise.
- **Issue**: Chromium launched with `--no-sandbox` and `--disable-setuid-sandbox`.
- **Impact**: Renderer exploits achieve direct host/container compromise.
- **Remediation**: Configure host kernel namespaces or use isolated worker containers with seccomp instead of `--no-sandbox`.

---

### Medium

#### Pre-Verification Account Takeover / Overwrite — Business Logic

- **Source scan**: `sast/businesslogic-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `app/api/auth/signup/route.ts` (lines 21-41)
- **Severity rationale**: Subsequent signup calls with the same unverified email overwrite password hashes without authentication.
- **Issue**: Unverified user records are updated in place on new signup calls.
- **Impact**: Account takeover of unverified users.
- **Remediation**: Prevent password updates on unverified accounts through public signup.

#### Cryptographically Insecure PRNG for Verification Codes — Missing Auth

- **Source scan**: `sast/missingauth-results.md`
- **Classification**: Vulnerable
- **Endpoint / File**: `lib/email.ts` (lines 7-10)
- **Severity rationale**: `Math.random()` generates predictable outputs that can be reverse-engineered by observing PRNG sequences.
- **Issue**: Verification codes generated via `Math.random()`.
- **Impact**: Predictability of verification codes.
- **Remediation**: Use `crypto.randomInt(100000, 1000000)`.

#### Missing Rate Limiting on Credential Login — Missing Auth ⚠ Likely Vulnerable

- **Source scan**: `sast/missingauth-results.md`
- **Classification**: Likely Vulnerable
- **Endpoint / File**: `app/api/auth/login/route.ts` (lines 6-32)
- **Severity rationale**: Credential stuffing and dictionary attacks can proceed without throttling.
- **Issue**: Absence of failed login attempt throttling.
- **Remediation**: Implement IP and account-level rate limiting.

#### User-Controlled Handlebars Template Compilation — SSTI ⚠ Likely Vulnerable

- **Source scan**: `sast/ssti-results.md`
- **Classification**: Likely Vulnerable
- **Endpoint / File**: `lib/template-engine.ts` (lines 4-23)
- **Severity rationale**: Untrusted template strings compiled by Handlebars can trigger DoS or prototype-related issues.
- **Issue**: Handlebars compiles arbitrary user strings directly.
- **Remediation**: Restrict template complexity and enforce execution timeouts.

#### Incomplete Path Containment Verification in `readUpload` — Path Traversal ⚠ Likely Vulnerable

- **Source scan**: `sast/pathtraversal-results.md`
- **Classification**: Likely Vulnerable
- **Endpoint / File**: `lib/assets.ts` (lines 22-26)
- **Severity rationale**: `full.startsWith(UPLOAD_ROOT)` does not ensure trailing path separators, risking prefix confusion.
- **Issue**: Boundary check omits `path.sep`.
- **Remediation**: Check against `UPLOAD_ROOT + path.sep`.

#### Lack of Strict Magic Byte Validation in AI Bill Upload — File Upload ⚠ Likely Vulnerable

- **Source scan**: `sast/fileupload-results.md`
- **Classification**: Likely Vulnerable
- **Endpoint / File**: `app/api/ai/analyze-bill/route.ts` (lines 28-44)
- **Severity rationale**: Source files written to disk without checking magic bytes.
- **Remediation**: Validate image headers with `file-type`.

#### Arbitrary MIME Type and Missing Content-Disposition on Asset Serving — XSS ⚠ Likely Vulnerable

- **Source scan**: `sast/xss-results.md`
- **Classification**: Likely Vulnerable
- **Endpoint / File**: `app/api/assets/[id]/route.ts` (lines 16-21)
- **Severity rationale**: Assets served without `Content-Security-Policy: sandbox` or `nosniff`.
- **Remediation**: Add security headers to asset responses.

---

## Appendix: Scan Coverage

| Scan | Result File | Status |
|------|-------------|--------|
| IDOR | `sast/idor-results.md` | Completed |
| SQLi | `sast/sqli-results.md` | Completed |
| SSRF | `sast/ssrf-results.md` | Completed |
| XSS | `sast/xss-results.md` | Completed |
| RCE | `sast/rce-results.md` | Completed |
| XXE | `sast/xxe-results.md` | Completed |
| File Upload | `sast/fileupload-results.md` | Completed |
| Path Traversal | `sast/pathtraversal-results.md` | Completed |
| SSTI | `sast/ssti-results.md` | Completed |
| JWT | `sast/jwt-results.md` | Completed |
| Missing Auth | `sast/missingauth-results.md` | Completed |
| Business Logic | `sast/businesslogic-results.md` | Completed |
| Hardcoded Secrets | `sast/hardcodedsecrets-results.md` | Completed |
| GraphQL injection | `sast/graphql-results.md` | Completed |
