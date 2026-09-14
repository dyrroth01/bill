# File Upload Analysis Results: BillFlow

## Executive Summary
- Endpoints analyzed: 3
- Vulnerable: 1
- Likely Vulnerable: 1
- Not Vulnerable: 1
- Needs Manual Review: 0

## Findings

### [VULNERABLE] Arbitrary Content-Type Storage and Insecure File Serving
- **File**: `app/api/assets/route.ts` (lines 34-40), `app/api/assets/[id]/route.ts` (lines 15-21), `lib/assets.ts` (lines 9-20)
- **Endpoint / function**: `POST /api/assets`, `GET /api/assets/[id]`
- **Issue**:
  When a file is uploaded via `POST /api/assets`:
  ```ts
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = sanitizeExt(extFromMime(file.type || "", file.name));
  const rel = await saveUpload(user.id, "assets", ext, bytes);
  const asset = await db.asset.create({
    data: { userId: user.id, kind, filePath: rel, mimeType: file.type || "application/octet-stream" },
  });
  ```
  And when served via `GET /api/assets/[id]`:
  ```ts
  const buf = await readUpload(asset.filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, max-age=86400",
    },
  });
  ```
  1. The server performs no magic byte / file signature validation.
  2. The client can declare any MIME type (e.g. `text/html`, `image/svg+xml`).
  3. The response does not set `Content-Disposition: attachment` nor security headers (`Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`).
- **Taint trace**:
  Client upload (`file.type = "text/html"`) -> stored in DB -> served back directly as `text/html` in the application origin.
- **Impact**: Stored Cross-Site Scripting (XSS) under the application origin and client-side code execution.
- **Remediation**:
  1. Validate uploaded file contents using magic byte inspection (e.g. `file-type` package) rather than client headers.
  2. Whitelist allowed MIME types strictly to raster images (`image/jpeg`, `image/png`, `image/webp`).
  3. Serve assets with `X-Content-Type-Options: nosniff` and `Content-Disposition: inline; filename="asset.png"`.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/assets \
    -H "Cookie: bf_session=<SESSION_TOKEN>" \
    -F "file=@payload.html;type=text/html" \
    -F "kind=image"
  # Fetch the resulting /api/assets/<ID> in a browser to see HTML/JS execution.
  ```

### [LIKELY VULNERABLE] Lack of Strict Magic Byte Validation in AI Bill Upload
- **File**: `app/api/ai/analyze-bill/route.ts` (lines 28-44), `lib/ai-media.ts` (lines 15-32)
- **Endpoint / function**: `POST /api/ai/analyze-bill`
- **Issue**: Uploaded bill files are inspected only by `mimeType === "application/pdf"` or `ALLOWED_IMAGE_MIMES.includes(mimeType)` based on the client-provided header `file.type`. While Sharp and pdf-to-img validate image decodability during processing, unvalidated files are saved directly to disk as source assets via `saveUpload(user.id, "sources", srcExt, prepared.original)`.
- **Remediation**: Inspect file buffer headers (magic bytes) before writing to disk.

### [NOT VULNERABLE] Web Shell Execution Prevention
- **File**: `lib/assets.ts`
- **Endpoint / function**: `saveUpload()`
- **Reason**: Files are stored in `<root>/uploads/` which is outside Next.js's public static file directory (`public/`). Uploaded files cannot be requested directly by filename through the web server and are not executed by an interpreter (PHP/JSP/CGI).
