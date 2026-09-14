# IDOR Analysis Results: BillFlow

## Executive Summary
- Endpoints analyzed: 12
- Vulnerable: 0
- Likely Vulnerable: 0
- Not Vulnerable: 11
- Needs Manual Review: 1

## Findings

### [NOT VULNERABLE] Bill Access Control Scoped by User ID
- **File**: `app/api/bills/[id]/route.ts` (lines 7-9), `app/api/bills/[id]/pdf/route.ts` (lines 13-14), `app/api/bills/[id]/pdf-link/route.ts` (lines 12-13)
- **Endpoint / function**: `GET`, `PUT`, `DELETE /api/bills/[id]`, `GET /api/bills/[id]/pdf`
- **Reason**:
  All individual bill operations query the database using compound filters that include `userId: user.id`:
  ```ts
  async function getBill(userId: string, id: string) {
    return db.bill.findFirst({ where: { id, userId } });
  }
  ```
  Attempting to read, update, delete, or generate a PDF for a bill belonging to another user returns HTTP 404.

### [NOT VULNERABLE] Client Record Access Scoped by User ID
- **File**: `app/api/clients/[id]/route.ts` (lines 10, 32)
- **Endpoint / function**: `PUT`, `DELETE /api/clients/[id]`
- **Reason**:
  Client queries enforce `where: { id, userId: user.id }`. Users cannot modify or delete client records belonging to other tenants.

### [NOT VULNERABLE] Template Record Access Scoped by User ID
- **File**: `app/api/templates/[id]/route.ts` (lines 8-10), `app/api/templates/[id]/preview/route.ts` (lines 12, 29)
- **Endpoint / function**: `GET`, `PUT`, `DELETE /api/templates/[id]`
- **Reason**:
  Template access helper `getTemplate` mandates `where: { id, userId: reqUserId }`.

### [NOT VULNERABLE] Asset Access Scoped by User ID
- **File**: `app/api/assets/[id]/route.ts` (line 11)
- **Endpoint / function**: `GET /api/assets/[id]`
- **Reason**:
  Asset lookups enforce `where: { id, userId: user.id }`. Cross-tenant file downloads via asset IDs are rejected with 404.

### [NEEDS MANUAL REVIEW] Public Signed Bill PDF Link Access
- **File**: `app/api/public/bill-pdf/route.ts` (lines 9-23), `lib/share-token.ts`
- **Endpoint / function**: `GET /api/public/bill-pdf?id=...&exp=...&sig=...`
- **Uncertainty**:
  This endpoint intentionally allows unauthenticated access to bill PDFs when a valid HMAC-SHA256 signature is provided. Possession of the signed URL grants read access to the bill PDF for 15 minutes.
- **Suggestion**:
  Ensure that signed links are shared only over secure channels (HTTPS) and verify that the 15-minute expiration period meets tenant privacy expectations. If permanent public sharing is ever needed, ensure distinct permission toggles exist.
