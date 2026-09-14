# Business Logic Analysis Results: BillFlow

## Executive Summary
- Endpoints analyzed: 14
- Vulnerable: 2
- Likely Vulnerable: 0
- Not Vulnerable: 12
- Needs Manual Review: 0

## Findings

### [VULNERABLE] Arbitrary Subscription Plan Escalation (Free Pro Upgrade)
- **File**: `app/api/subscription/route.ts` (lines 23-47)
- **Endpoint / function**: `POST /api/subscription`
- **Issue**:
  The application allows any authenticated user to upgrade their plan to "pro" without any payment processor integration (such as Stripe, Razorpay, LemonSqueezy) or payment verification:
  ```ts
  export async function POST(req: NextRequest) {
    try {
      const user = await requireUser();
      const body = await req.json();
      const targetPlan = body.plan === "pro" ? "pro" : "free";

      const updated = await db.user.update({
        where: { id: user.id },
        data: {
          plan: targetPlan,
          planSubscribedAt: targetPlan === "pro" ? new Date() : null,
        },
      });
  ```
  Once updated, the user immediately receives all Pro features:
  - Unlimited bills (bypassing the 50 bill cap in `POST /api/bills`).
  - Unlimited AI generations (bypassing the 5 generation cap in `app/api/ai/*`).
  - 10 GB storage quota instead of 500 MB.
  - Zero advertisement flags.
- **Taint trace**:
  Authenticated HTTP request with `{"plan":"pro"}` directly sets `User.plan = "pro"` in the database.
- **Impact**: Critical business logic failure resulting in complete financial bypass / unauthorized access to paid features.
- **Remediation**:
  Integrate a real payment gateway (e.g. Razorpay or Stripe) and only upgrade users upon receiving a verified server-to-server webhook containing a cryptographically signed payment completion event.
- **Dynamic Test**:
  ```bash
  curl -X POST http://localhost:3000/api/subscription \
    -H "Cookie: bf_session=<FREE_USER_SESSION>" \
    -H "Content-Type: application/json" \
    -d '{"plan":"pro"}'
  # Response confirms upgrade: {"ok":true,"message":"Upgraded to Pro Business Plan ($5/month)!"}
  ```

### [VULNERABLE] Pre-Verification Account Takeover / Overwrite
- **File**: `app/api/auth/signup/route.ts` (lines 21-41)
- **Endpoint / function**: `POST /api/auth/signup`
- **Issue**:
  When a user signs up, if an account with that email already exists but is not yet verified (`emailVerified: false`), the signup endpoint unconditionally overwrites the account's password hash and name:
  ```ts
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.emailVerified) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { name, passwordHash, businessName: businessName || existing.businessName },
    });
  }
  ```
  If an attacker observes or anticipates a registration, they can overwrite the user's password. Coupled with the verification code leakage or brute-forcing, the attacker can hijack the pending account completely.
- **Remediation**:
  Do not update the password hash of an existing unverified user on subsequent signup requests without proving ownership, or invalidate old unverified records only upon verified ownership.
- **Dynamic Test**:
  ```bash
  # First signup by legitimate user
  curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" \
    -d '{"name":"Legit","email":"unverified@test.com","password":"UserPassword123"}'
  # Attacker overwrites password before verification
  curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" \
    -d '{"name":"Attacker","email":"unverified@test.com","password":"AttackerPassword123"}'
  ```

### [NOT VULNERABLE] Server-Side Bill Totals and Tax Computation
- **File**: `lib/api.ts` (draftTotals, parseDraft), `app/api/bills/route.ts` (lines 64-65)
- **Endpoint / function**: Bill creation and update
- **Reason**: The application recalculates line item amounts, subtotals, CGST/SGST/IGST tax values, and grand totals strictly on the server using `draftTotals(draft)`. Client attempts to manipulate computed totals are overwritten by server-side math.
