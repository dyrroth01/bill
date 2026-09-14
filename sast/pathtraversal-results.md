# Path Traversal Analysis Results: BillFlow

## Executive Summary
- Endpoints and functions analyzed: 5
- Vulnerable: 0
- Likely Vulnerable: 1
- Not Vulnerable: 4
- Needs Manual Review: 0

## Findings

### [LIKELY VULNERABLE] Incomplete Path Containment Verification in `readUpload`
- **File**: `lib/assets.ts` (lines 22-26)
- **Endpoint / function**: `readUpload(relPath: string)`
- **Issue**:
  ```ts
  export async function readUpload(relPath: string): Promise<Buffer> {
    const full = path.join(UPLOAD_ROOT, relPath);
    if (!full.startsWith(UPLOAD_ROOT)) throw new Error("Invalid path");
    return readFile(full);
  }
  ```
  Checking `full.startsWith(UPLOAD_ROOT)` without ensuring that `UPLOAD_ROOT` ends with a path separator (`path.sep`) introduces a path traversal flaw known as "partial path traversal" or prefix confusion.
  For example, if `UPLOAD_ROOT` is `/var/app/uploads`, a path resolving to `/var/app/uploads_backup/secret.txt` or `/var/app/uploads-data/config.env` satisfies `full.startsWith(UPLOAD_ROOT)` even though it escapes the designated folder.
- **Taint trace**:
  Currently, `relPath` in `readUpload` comes from `Asset.filePath` or `Bill.pdfPath` in database rows. However, any direct manipulation or future endpoint exposing `relPath` would bypass the boundary check.
- **Remediation**:
  Ensure path boundary check includes the path separator:
  ```ts
  const safeRoot = UPLOAD_ROOT.endsWith(path.sep) ? UPLOAD_ROOT : UPLOAD_ROOT + path.sep;
  const full = path.resolve(UPLOAD_ROOT, relPath);
  if (!full.startsWith(safeRoot)) throw new Error("Invalid path");
  ```

### [NOT VULNERABLE] Randomized Filename Generation on Uploads
- **File**: `lib/assets.ts` (lines 9-20)
- **Endpoint / function**: `saveUpload()`
- **Reason**: `saveUpload` does not use client-supplied filenames. It constructs filenames using `Date.now()`, `crypto.randomBytes(5).toString("hex")`, and a sanitized extension (`sanitizeExt()`), eliminating directory traversal characters (`../`) from upload destinations.
