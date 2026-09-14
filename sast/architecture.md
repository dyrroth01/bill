# Architecture: BillFlow (billing app plus website)

## Technology Stack

| Category | Details |
|---|---|
| Languages | TypeScript (~5.7 web, ~6.0 mobile), no other languages; compiled/bundled by Next.js (web) and Metro (mobile) |
| Frameworks | Next.js 15 App Router (web app + REST API, React 19, Tailwind CSS 4); Expo SDK 57 / React Native 0.86 with expo-router (mobile client); Handlebars 4.7 (server-side template engine for bill HTML) |
| Databases | PostgreSQL via Prisma ORM 6.5 (schema `prisma/schema.prisma`, datasource `postgresql`, URL from `DATABASE_URL`); local DB provided by `docker-compose.yml` (`postgres:15-alpine`, user/pass `postgres`). A legacy `prisma/dev.db` SQLite file from an earlier config still exists on disk (README references it) but is excluded from scope |
| Auth mechanism | Session JWT (HS256, signed with `AUTH_SECRET`, 30-day expiry) stored in `bf_session` httpOnly cookie (SameSite=Lax, secure in production). Credentials: bcryptjs (cost 10) password hashes. Email verification: 6-digit codes (10-min expiry) stored in `VerificationCode` table. Social login: Google OAuth 2.0 authorization-code flow with CSRF state in `bf_oauth_state` cookie (10 min). PDF sharing: HMAC-SHA256 truncated (32 hex chars) signed links via `lib/share-token.ts` |
| Infrastructure | Docker Compose (Postgres only — app runs on host via `next dev`); `next.config.ts` marks `puppeteer`, `sharp`, `handlebars`, `mammoth`, `pdf-to-img`, `@napi-rs/canvas` as server-external packages; file storage is the local filesystem (`uploads/<userId>/{assets,sources,pdfs}`); no CI/CD configs present |
| External services | Google Gemini API (`@google/genai`, model `gemini-2.5-flash`) for AI bill analysis + template HTML generation; Resend REST API (`api.resend.com`) for verification emails (falls back to console logging + `devCode` in API response when `RESEND_API_KEY` is unset); Google OAuth 2.0 (`accounts.google.com`, `oauth2.googleapis.com`, `googleapis.com/oauth2/v2/userinfo`); headless Chromium via Puppeteer for HTML→PDF rendering |

## Architecture Overview

BillFlow is a two-client, single-server system for Indian small-business invoicing:

1. **Web app (Next.js 15 monolith)** — one deployable containing the React UI (`app/` pages, `components/`), a REST API (`app/api/**/route.ts`), and all business logic in `lib/` (~20 modules). Server components and client components both hit the same REST API through the session cookie. There is no separate backend service; API routes are thin controllers over `lib/` helpers and Prisma.
2. **Mobile app (Expo/RN, `mobile/src/`)** — a thin client over the same REST API. `mobile/src/lib/api.ts` is a cookie-jar fetch wrapper: the server URL is user-configurable (default `http://10.0.2.2:3100` for the Android emulator) and stored in AsyncStorage along with the raw `bf_session` cookie, which is replayed via the `Cookie` header on every request. No direct database or file access from mobile.

Main server modules and responsibilities:
- `lib/auth.ts` — bcrypt hashing, JWT session sign/verify, cookie set/clear, `requireUser()` guard thrown from API routes (`UnauthorizedError` → 401 via `lib/api.ts apiError`).
- `middleware.ts` — Edge middleware that validates the `bf_session` JWT for **page routes only** (`/welcome`, `/dashboard/*`, `/bills/*`, `/templates/*`, `/clients/*`, `/settings/*`) and redirects to `/login`. It does **not** run on `/api/**`; every API route performs its own `requireUser()`/`getSessionUser()` check (or is intentionally public).
- `lib/db.ts` — global Prisma client singleton.
- `lib/api.ts` — tolerant parsing of bill drafts from client JSON (`parseDraft`), field validation, totals computation, client upsert, JSON block/field parsing.
- `lib/template-engine.ts` — sandboxed Handlebars instance (`Handlebars.create()`) with `inr`/`dateFmt`/`upper` helpers; compiles user-authored template HTML with escaping enabled (`noEscape: false`); `validateTemplateHtml` compile-checks templates.
- `lib/context.ts` / `lib/sample-data.ts` — build the full Handlebars render context (seller, client, items, totals, bank, payment, custom `extra` fields, block flags, asset data-URLs).
- `lib/render-bill.ts` — creates immutable template snapshots (HTML + logo/signature data-URLs + seller profile embedded as JSON in `Bill.templateSnapshot`) and renders bills to HTML/PDF, falling back template → any user template.
- `lib/pdf.ts` — cached headless-Chromium (Puppeteer) browser; renders HTML strings to PDF in memory with `--no-sandbox` launch args; no disk writes for new PDFs (legacy `Bill.pdfPath` files still read if present).
- `lib/assets.ts` — filesystem storage under `UPLOAD_ROOT = <cwd>/uploads`; generated filenames (`Date.now()-random.ext`), extension sanitization, and a `startsWith(UPLOAD_ROOT)` containment check in `readUpload`.
- `lib/ai-media.ts` — image/PDF normalization via sharp and pdf-to-img, AI-driven logo/signature cropping, `stripScripts` (removes `<script>` and inline `on*=` handlers from imported HTML) and `ensureHtmlDoc`.
- `lib/gemini.ts` — Gemini calls for bill-photo analysis (structured JSON) and template HTML generation, with a mock/demo mode when no key is configured; key resolution is `GEMINI_API_KEY` env first, per-user key second (per-user key storage is referenced in README/`resolveGeminiKey` but not present in the current schema).
- `lib/google-auth.ts` / `lib/email.ts` — OAuth URL building + code exchange; 6-digit code generation + Resend dispatch with dev fallback.
- `lib/quotas.ts` / `lib/quotas-client.ts` — plan limits (Free: 50 bills, 5 AI generations, 500 MB storage, ads; Pro: unlimited/10 GB), storage accounting by walking `uploads/<userId>`.
- `lib/builtin-templates.ts` — four static starter templates (Classic, GST, Modern A4, Blank) seeded into new accounts.

Privilege levels: a single user role; no admin panel, no admin routes, no roles table. Tier differentiation is `User.plan` (`free` | `pro`) enforced inline in the bills POST, AI routes, and assets POST (free-tier quotas) and exposed via `/api/auth/me` and `/api/subscription`. All data queries are scoped by `userId` (Prisma `findFirst`/`findMany` with `userId` filters); there are no cross-tenant read paths except the signed public PDF link. Plan switching via `POST /api/subscription` is a direct DB update with no payment processor involved.

## Data Flow

**Signup (email/password):** `app/(auth)/signup/page.tsx` (or mobile `signup.tsx`) → `POST /api/auth/signup` with `{name, email, password, businessName}` → validated (email regex, password ≥ 6) → bcrypt hash stored in `User` (upsert over unverified accounts) → 6-digit code stored plaintext in `VerificationCode` (10-min expiry) → Resend email, or console log + `devCode` echoed in the JSON response when no API key → user submits code → `POST /api/auth/verify-code` → code matched, `emailVerified=true`, starter templates seeded, codes deleted, `setSessionCookie` (JWT in `bf_session`).

**Login:** credentials → `POST /api/auth/login` → bcrypt compare → session cookie. **Google OAuth:** `GET /api/auth/google` sets `bf_oauth_state` cookie and redirects to Google → `GET /api/auth/google/callback` validates state, exchanges code, fetches profile, links/creates `User` by `googleId`/email (auto `emailVerified=true`, seeds templates), sets session cookie, redirects to `/welcome` or `/dashboard`.

**Bill creation/editing (web):** `BillForm.tsx` collects draft JSON (billNo, dates, client info, items[], extra custom fields, tax rates, notes, cheque no) → `POST /api/bills` or `PUT /api/bills/[id]` → `parseDraft` (stringification/number coercion) → `validateDraftFields` → free-tier bill-count quota → `upsertClient` (find-or-create `Client`, patching empty fields) → `draftTotals` (server-side computation of subtotal/GST/total/amount-in-words) → `createTemplateSnapshot` (embeds template HTML + logo/signature as base64 data-URLs + seller profile into `Bill.templateSnapshot`) → `Bill` row created with items/extra/payments stored as JSON strings. Status/payment actions (`PAID`, `INSTALLMENT`, `DELETE_INSTALLMENT`, `RESET`) mutate `payments` JSON and `paidAmount`.

**Template creation (three paths):** (1) manual HTML in `TemplateEditor.tsx` → `POST/PUT /api/templates/[id]` → `validateTemplateHtml` compile check → stored in `Template.html`; (2) import: file upload (`.html`/`.docx`/`.pdf`, ≤20 MB) → `POST /api/templates/import` → `stripScripts` + `ensureHtmlDoc` (or mammoth docx→HTML, or Gemini for PDF) → optional Gemini "placeholderize" → `Template` row; (3) AI Bill Maker: photo/PDF → `POST /api/ai/analyze-bill` (≤20 MB, free quota check) → sharp/pdf-to-img normalization → source saved as `Asset` (kind `source`) → Gemini analysis → logo/signature crops saved as `Asset`s → `POST /api/ai/generate-template` → Gemini generates Handlebars HTML, compile-validated → `Template` row + usage counter incremented. Built-in templates are copied via `POST /api/templates/from-builtin`.

**Asset upload:** `POST /api/assets` (multipart, ≤15 MB, storage quota) → extension sanitized → saved to `uploads/<userId>/assets/…` → `Asset` row (kind, filePath, mimeType). Served back to the authenticated owner only via `GET /api/assets/[id]` (content type from stored mimeType).

**PDF rendering:** `GET /api/bills/[id]/pdf` (owner session) → uses legacy `Bill.pdfPath` file if it exists, else renders: snapshot/template HTML → `buildRenderContext` (bill data + seller + asset data-URLs) → Handlebars render → Puppeteer → PDF bytes returned inline (filename derived from `billNo` with non-word chars replaced). **Mobile PDF:** `GET /api/bills/[id]/pdf-link` → HMAC-signed URL (`id`, `exp` = now+15 min, `sig`) → `GET /api/public/bill-pdf` (no session; token verified with timing-safe compare) → same render path. Possession of the unexpired signed URL grants PDF access.

**Preview rendering (client):** template/draft previews are rendered server-side to full HTML documents and returned as JSON; web components insert them into `<iframe srcDoc>` elements (BillForm, NewTemplateTabs, TemplateEditor, TemplateCardActions, bills/[id] page).

**Dashboard/stats:** `GET /api/stats` loads all of the user's bills and computes paid/partial/pending/overdue aggregates in Node (statuses also computed client-side by `lib/bills.ts effectiveStatus`). Settings (`GET/PUT /api/settings`) round-trip the seller profile including bank details.

## Entry Points

| Entry Point | Type | Auth Required | Description |
|---|---|---|---|
| `/` | HTTP page | No | Public landing; server component redirects signed-in users to `/dashboard` or `/welcome` |
| `/login`, `/signup` | HTTP page | No | Email/password + Google sign-in UI; signup runs the 6-digit verification flow |
| `/welcome`, `/dashboard`, `/bills/*`, `/templates/*`, `/clients/*`, `/settings` | HTTP pages | Yes (middleware) | App UI pages; middleware validates `bf_session` JWT and redirects to `/login` otherwise |
| `POST /api/auth/signup` | HTTP API | No | Account creation + verification code generation/dispatch |
| `POST /api/auth/verify-code` | HTTP API | No | 6-digit code check → email verification, template seeding, session issuance |
| `POST /api/auth/resend-code` | HTTP API | No | Re-issue verification code; self-imposed 30-second cooldown, 10-min expiry |
| `POST /api/auth/login` | HTTP API | No | Credential check (bcrypt) → session cookie |
| `POST /api/auth/logout` | HTTP API | No | Clears session cookie (no token presented required) |
| `GET /api/auth/me` | HTTP API | No (returns `user: null` when anonymous) | Session introspection + quota/usage info |
| `POST /api/auth/me` | HTTP API | Yes | Marks onboarding complete |
| `GET /api/auth/google` | HTTP API | No | Starts OAuth flow; if unconfigured, serves a setup-guide HTML page |
| `GET /api/auth/google/callback` | HTTP API | No (state-validated) | OAuth code exchange, user link/create, session issuance, redirect |
| `GET /api/bills`, `POST /api/bills` | HTTP API | Yes (per-route) | List (status/q/templateId filters) and create bills; free-tier quota |
| `GET/PUT/DELETE /api/bills/[id]` | HTTP API | Yes (per-route) | Bill detail, full draft update, payment/installment actions (`PAID`, `INSTALLMENT`, `DELETE_INSTALLMENT`, `RESET`), delete |
| `GET/POST /api/bills/[id]/pdf` | HTTP API | Yes (per-route) | PDF bytes (on-demand render or legacy file); POST = render test |
| `GET /api/bills/[id]/pdf-link` | HTTP API | Yes (per-route) | Issues 15-minute HMAC-signed PDF URL for mobile |
| `GET /api/public/bill-pdf?id&exp&sig` | HTTP API | No (signed-link) | Public PDF serving; validates truncated HMAC-SHA256 token + expiry |
| `GET/POST /api/clients` | HTTP API | Yes (per-route) | List clients (with bill aggregates), create client |
| `PUT/DELETE /api/clients/[id]` | HTTP API | Yes (per-route) | Update/delete client (bills keep clientName snapshot) |
| `GET/POST /api/templates` | HTTP API | Yes (per-route) | List active templates; create from raw HTML (compile-validated) |
| `GET/PUT/DELETE /api/templates/[id]` | HTTP API | Yes (per-route) | Template detail/update/delete (delete deactivates if bills reference it) |
| `GET/POST /api/templates/[id]/preview` | HTTP API | Yes (per-route) | Render template HTML with sample data (GET) or live bill draft (POST) |
| `POST /api/templates/import` | HTTP API | Yes (per-route) | Upload `.html`/`.docx`/`.pdf` (≤20 MB) → template; optional AI conversion |
| `POST /api/templates/from-builtin` | HTTP API | Yes (per-route) | Clone a built-in starter template |
| `POST /api/assets` | HTTP API | Yes (per-route) | Multipart file upload (≤15 MB, storage quota) → filesystem + `Asset` row |
| `GET /api/assets/[id]` | HTTP API | Yes (per-route) | Serve uploaded file bytes to the owning user only |
| `POST /api/ai/analyze-bill` | HTTP API | Yes (per-route, free quota) | Bill photo/PDF analysis; saves source + cropped logo/signature assets |
| `POST /api/ai/generate-template` | HTTP API | Yes (per-route, free quota) | Gemini template HTML generation from analysis + stored source image |
| `GET/PUT /api/settings` | HTTP API | Yes (per-route) | Read/update seller profile incl. business + bank details |
| `POST /api/settings/test-gemini` | HTTP API | Yes (per-route) | Liveness test of server `GEMINI_API_KEY` |
| `GET /api/stats` | HTTP API | Yes (per-route) | Dashboard aggregates computed over all of the user's bills |
| `GET/POST /api/subscription` | HTTP API | Yes (per-route) | Usage/tier info; plan switch (free ↔ pro) with no payment step |
| Mobile screens (`login`, `signup`, `(tabs)/index|bills|new-bill|templates|settings`, `bill/[id]`) | Mobile UI (Expo Router) | Client-side gate (via `/api/auth/me` probe) | Thin clients over the API above; no local storage of business data besides server URL + session cookie in AsyncStorage |

Counts: 28 REST route files (~42 HTTP method handlers), 13 page routes + root layout on the web, 8 routed screens in the mobile app. No GraphQL, WebSocket, CLI, or scheduled-job entry points exist.

## Trust Boundaries

1. **Browser (web UI) → Next.js API.** All client-supplied JSON bodies (bill drafts, template HTML, settings, plan), query parameters (status, q, templateId), and multipart file uploads (assets ≤15 MB, imports ≤20 MB) cross here. Trusted side: session cookie; untrusted side: everything in the request body/form.
2. **Anonymous internet → auth endpoints.** `POST /api/auth/signup|verify-code|resend-code|login|logout`, `GET /api/auth/me`, and both Google OAuth routes accept unauthenticated traffic (only signup/resend-code have internal throttles: 30-second code-reissue cooldown; no other rate limiting exists).
3. **Anonymous internet → public PDF link.** `/api/public/bill-pdf` trusts the HMAC signature over `billId.exp` (truncated to 32 hex chars, timing-safe compare) plus `exp` freshness; bearer possession of the URL is the only authorization.
4. **Mobile app → API.** The mobile client's server URL is fully user-configurable (plain `http://` by default, LAN IPs expected); the session cookie is persisted in AsyncStorage and replayed on every request. The server cannot distinguish mobile from web clients.
5. **Server → PostgreSQL.** All access through Prisma with parameterized queries and `userId` scoping; JSON columns (items, extra, payments, fieldSchema, blocks, templateSnapshot) are serialized/deserialized at the application layer.
6. **Server → filesystem.** Uploads written under `uploads/<userId>/<kind>/` with server-generated names and sanitized extensions; reads go through `readUpload`, which enforces a `startsWith(UPLOAD_ROOT)` path-containment check. Legacy `Bill.pdfPath` values from the DB are used as relative paths.
7. **User-authored template HTML → Handlebars → Puppeteer (headless Chromium).** Templates are arbitrary user-supplied HTML compiled server-side (escaping enabled for interpolated values, but the HTML itself is not sanitized for AI/import paths beyond `stripScripts` on imports) and rendered to PDF inside a real browser process. Bill field values and asset data-URLs are interpolated into that HTML as the render context.
8. **Server-rendered preview HTML → browser `<iframe srcDoc>`.** Full HTML documents produced by the template engine (including user template HTML and user bill data) are returned via JSON and mounted client-side in iframes on the web app.
9. **Server → external services.** Uploaded bill images (base64 JPEG/PNG of PDF first page) are sent to Google Gemini; recipient email addresses and codes go to Resend; OAuth codes go to Google. Outbound trust derives from env-configured keys (`GEMINI_API_KEY`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`).
10. **Environment/config → server code.** Secrets and feature flags come from `.env` (`DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GOOGLE_CLIENT_ID/SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`). Both `middleware.ts` and `lib/auth.ts`/`lib/share-token.ts` fall back to hardcoded default secrets (`"billflow-dev-secret-change-me"` / `"billflow-dev-secret"`) when `AUTH_SECRET` is unset.

## Sensitive Data Inventory

| Data Type | Where Stored | How Accessed | Protection |
|---|---|---|---|
| Passwords | `User.passwordHash` (bcrypt, cost 10) | Verified on login only; never returned by any API | bcrypt hashing; generic "Invalid email or password" responses |
| Session tokens | HS256 JWT in `bf_session` httpOnly cookie (30-day expiry); raw cookie duplicated in mobile AsyncStorage (`bf_session_cookie`) | Cookie on web; replayed `Cookie` header on mobile; verified by middleware (pages) and `requireUser()` (APIs) | httpOnly, SameSite=Lax, `secure` in production; signed with `AUTH_SECRET` (hardcoded dev fallback exists) |
| Email verification codes | `VerificationCode.code` (plaintext 6 digits) + `expiresAt` | `POST /api/auth/verify-code` / `resend-code`; delivered via Resend email or server console; also echoed as `devCode` in signup/resend JSON responses when `RESEND_API_KEY` is unset (demo mode) | 10-minute expiry, single-email deletion after use, 30-second resend cooldown; no attempt counter |
| Google OAuth secrets | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env` (server-side only) | Server-to-server token exchange; client secret never reaches the client | Env-based; `.env` present in repo root and listed in `.gitignore` |
| AI / email API keys | `GEMINI_API_KEY`, `RESEND_API_KEY` in `.env` (server-side only; `GEMINI_MODEL` non-secret) | Server-side Gemini calls, Resend dispatch; mere boolean exposure via `/api/auth/me` (`aiEnabled`) and settings endpoints | Env-based; keys never returned to clients |
| Bank account details (account no, IFSC, UPI ID, bank name) | `User.bankName/bankAccountNo/bankIfsc/bankUpiId` (plaintext); copied into every `Bill.templateSnapshot` JSON; rendered into bill PDFs and preview HTML | Owner via `GET/PUT /api/settings`; embedded in PDFs served to owner and to holders of valid signed PDF links; embedded in Handlebars render context | Owner-scoped queries only; stored/rendered in plaintext (printed on invoices by design) |
| Business PII (owner name, business name/address/phone, GSTIN, avatar URL) | `User` table; `templateSnapshot.sellerSnapshot`; rendered into PDFs | Owner via auth APIs/settings; seller snapshot embedded in bills | Owner-scoped; plaintext |
| Client PII (name, address, phone, GSTIN) | `Client` table + `Bill.clientName` snapshot + bill render context | Owner via `/api/clients` and bill APIs; printed on invoices | Owner-scoped; plaintext |
| Financial data (bill totals, GST amounts/rates, payments ledger, cheque numbers/status, paidAmount) | `Bill` table columns + `payments` JSON string; aggregates via `/api/stats` | Owner via bill APIs, stats, PDFs | Owner-scoped; plaintext; payment entries carry user-supplied mode/cheque fields |
| Uploaded files (logos, signatures, source bill photos/PDF pages) | Local filesystem `uploads/<userId>/{assets,sources}/…` + `Asset` rows (filePath, mimeType) | Owner-only via `GET /api/assets/[id]`; embedded as base64 data-URLs inside template snapshots and PDFs | Server-generated filenames, sanitized extensions, size limits (15/20 MB), storage quotas (500 MB free / 10 GB pro), upload-root containment check on reads |
| Rendered bill PDFs | In-memory (current design) or legacy files under `uploads/<userId>/pdfs` referenced by `Bill.pdfPath` | Owner via `/api/bills/[id]/pdf`; anyone via unexpired signed link `/api/public/bill-pdf` | Session auth or 15-minute HMAC-signed URL; `Content-Disposition` filename sanitized |
| Template HTML (user-authored) | `Template.html` + JSON `blocks`/`fieldSchema`; frozen copies in `Bill.templateSnapshot` | Owner CRUD via templates APIs; compiled server-side and rendered in Puppeteer/iframes | Handlebars escaping of interpolated values; compile validation; `stripScripts` applied only on the import path |
| Infra secrets/config | `.env` at repo root (real values present); `.env.example` documents shape; `docker-compose.yml` contains default Postgres credentials (`postgres`/`postgres`) | Loaded by Next.js server runtime at boot | `.env` in `.gitignore`; no secrets in client bundles; `NEXT_PUBLIC_APP_URL` is the only public env var |
