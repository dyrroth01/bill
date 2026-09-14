# Hardcoded Secrets Analysis Results: BillFlow

## Executive Summary
- Files analyzed: 35
- Vulnerable: 2
- Likely Vulnerable: 1
- Not Vulnerable: 32
- Needs Manual Review: 0

## Findings

### [VULNERABLE] Live Third-Party API Keys and Credentials in Local `.env` File
- **File**: `.env` (lines 5, 9, 15, 16, 21)
- **Endpoint / function**: Environment configuration
- **Issue**:
  The `.env` file contains sensitive live API credentials:
  - `GEMINI_API_KEY`: Real Google AI Studio API key (`AQ.Ab8RN6JjRTG1VF...`).
  - `GOOGLE_CLIENT_SECRET`: Real Google OAuth 2.0 client secret (`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`).
  - `RESEND_API_KEY`: Real Resend email delivery API key (`re_Z8oGWSgH_...`).
  - `AUTH_SECRET`: Static session token signing secret.
- **Concern**:
  While `.env` is listed in `.gitignore`, active secrets present on developer machines risk exposure through backups, repository staging accidents, logs, or shared archives.
- **Remediation**:
  1. Rotate the exposed Resend API key, Google Client Secret, and Gemini API key immediately.
  2. Use a secrets manager or prompt-based environment injection for production deployments.

### [VULNERABLE] Hardcoded Fallback Secrets in Codebase
- **File**: `lib/auth.ts` (line 10), `middleware.ts` (line 4), `lib/share-token.ts` (line 6)
- **Endpoint / function**: Authentication token verification
- **Issue**:
  Code contains static fallback strings:
  - `"billflow-dev-secret-change-me"`
  - `"billflow-dev-secret"`
  These strings serve as secrets if `process.env.AUTH_SECRET` is missing.
- **Remediation**: Remove default strings; require explicit environment configuration.

### [LIKELY VULNERABLE] Verification Code Leakage via Logging
- **File**: `lib/email.ts` (lines 79-85)
- **Endpoint / function**: `logCodeToConsole()`
- **Issue**:
  When falling back, `logCodeToConsole` writes the plaintext 6-digit verification code to standard output. If server logs are centralized (e.g. Datadog, CloudWatch, PaperTrail), verification codes may be visible to log viewers.
- **Remediation**: Mask sensitive verification codes or omit them from structured production log output.
