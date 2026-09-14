# SSRF Analysis Results: BillFlow

## Executive Summary
- Endpoints analyzed: 6
- Vulnerable: 1
- Likely Vulnerable: 0
- Not Vulnerable: 5
- Needs Manual Review: 0

## Findings

### [VULNERABLE] Blind / Full-Content SSRF and Local File Disclosure via Headless Chromium PDF Generation
- **File**: `lib/pdf.ts` (lines 35-44, 57-76), `lib/render-bill.ts` (lines 236-271), `app/api/bills/[id]/pdf/route.ts`, `app/api/public/bill-pdf/route.ts`
- **Endpoint / function**: `GET /api/bills/[id]/pdf`, `GET /api/public/bill-pdf?id=...&exp=...&sig=...`
- **Issue**:
  Puppeteer is launched without network restrictions, request interception, or protocol filters:
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
  The user-controlled template HTML is loaded directly into the Chromium page using `page.setContent(html, { waitUntil: "load" })`.
  Because no request interception is in place (`page.setRequestInterception(true)` is not implemented) and `--disable-web-security` / protocol guards are not configured, Chromium will execute outgoing HTTP/HTTPS requests to internal IP addresses (`http://127.0.0.1`, `http://169.254.169.254`, private subnet ranges), as well as local file system lookups (`file:///`).
- **Taint trace**:
  1. An attacker creates a template containing:
     ```html
     <iframe src="http://169.254.169.254/latest/meta-data/identity-credentials/ec2/security-credentials/ec2-instance" style="width:1000px; height:800px;"></iframe>
     <!-- OR for local file read -->
     <iframe src="file:///C:/Windows/win.ini" style="width:1000px; height:800px;"></iframe>
     ```
  2. The attacker associates this template with a bill.
  3. The attacker (or any recipient of the public signed PDF link) requests `GET /api/bills/[id]/pdf` or `GET /api/public/bill-pdf`.
  4. Puppeteer renders the HTML. Chromium loads the internal URL or local file into the `iframe`.
  5. The rendered contents of the internal resource or file are stamped into the output PDF document returned in the HTTP response.
- **Impact**:
  1. Access to internal network services, private administration endpoints, cloud instance metadata (`http://169.254.169.254`), and Docker container services.
  2. Read arbitrary local files on the server (e.g. `/etc/passwd`, server environment files, source code).
- **Remediation**:
  1. Enable Puppeteer request interception (`await page.setRequestInterception(true)`) and block all requests to:
     - Non-HTTP/HTTPS protocols (specifically block `file://`, `ftp://`, `data:` if desired).
     - Private, loopback, and cloud metadata IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`).
  2. Alternatively, disallow `<iframe`, `<object`, `<embed`, `<link`, and external `<img` tags in template HTML.
- **Dynamic Test**:
  ```bash
  # Create a template with an iframe reading internal metadata or file
  curl -X POST http://localhost:3000/api/templates \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"name":"SSRF Test","html":"<html><body><iframe src=\"http://169.254.169.254/latest/meta-data/\"></iframe></body></html>"}'
  # Generate PDF and inspect bytes for metadata response
  ```

### [NOT VULNERABLE] Resend API Requests
- **File**: `lib/email.ts` (lines 22-55)
- **Endpoint / function**: `sendVerificationEmail()`
- **Reason**: The outgoing HTTP call is pinned to `https://api.resend.com/emails`. The URL is a hardcoded string constant and no user input controls the host, path, or port.

### [NOT VULNERABLE] Google OAuth API Requests
- **File**: `lib/google-auth.ts` (lines 64-96)
- **Endpoint / function**: `exchangeGoogleCodeForProfile()`
- **Reason**: All outgoing HTTP requests are pinned to Google's official endpoints (`https://oauth2.googleapis.com/token` and `https://www.googleapis.com/oauth2/v2/userinfo`). User input cannot alter target destinations.
