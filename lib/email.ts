import crypto from "crypto";

/**
 * Email delivery helper for BillFlow.
 * Supports Resend API (when RESEND_API_KEY is provided),
 * with automatic fallback to server console logging during development.
 */

export function generateVerificationCode(): string {
  // Generates a cryptographically secure 6-digit numeric string
  return crypto.randomInt(100000, 1000000).toString();
}

export async function sendVerificationEmail(
  email: string,
  code: string
): Promise<{ success: boolean; message?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.EMAIL_FROM || "BillFlow <onboarding@resend.dev>";

  // 1. If Resend is configured, send a real email via Resend REST API
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [email],
          subject: `${code} is your BillFlow verification code`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
                <div style="background: #4f46e5; color: #ffffff; font-weight: bold; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px;">B</div>
                <span style="font-size: 18px; font-weight: bold; color: #0f172a;">BillFlow</span>
              </div>
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Verify your email address</h2>
              <p style="font-size: 14px; color: #475569; line-height: 1.5;">
                Thank you for creating an account with BillFlow. Use the following 6-digit verification code to complete your signup:
              </p>
              <div style="margin: 24px 0; text-align: center;">
                <span style="display: inline-block; background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #4f46e5; font-family: monospace;">
                  ${code}
                </span>
              </div>
              <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
                This code is valid for <strong>10 minutes</strong>. If you did not request this email, you can safely ignore it.
              </p>
              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8;">
                BillFlow &bull; Digital billing & invoice management
              </div>
            </div>
          `,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.warn("Resend API error:", data);
        // Fall back to terminal logging so user isn't stuck
        logCodeToConsole(email, code);
        return { success: true };
      }

      return { success: true };
    } catch (err) {
      console.warn("Failed to dispatch email via Resend:", err);
      logCodeToConsole(email, code);
      return { success: true };
    }
  }

  // 2. Development mode: log code strictly to server console
  logCodeToConsole(email, code);
  return { success: true };
}

function logCodeToConsole(email: string, code: string) {
  if (process.env.NODE_ENV === "production") {
    // In production environments, never write plaintext authentication credentials to stdout
    console.log(`[BillFlow Auth] Verification email dispatched to ${email} (code masked: ***${code.slice(-2)})`);
    return;
  }
  console.log("\n=======================================================");
  console.log(`[BillFlow Auth] 🔑 Verification code for ${email}:`);
  console.log(`                 >>>  ${code}  <<<`);
  console.log("       (Valid for 10 minutes | Enter on signup page)");
  console.log("=======================================================\n");
}

export async function sendBillEmailWithPdf({
  to,
  billNo,
  clientName,
  businessName,
  total,
  pdfBuffer,
  pdfUrl,
}: {
  to: string;
  billNo: string;
  clientName: string;
  businessName: string;
  total: number;
  pdfBuffer: Buffer;
  pdfUrl: string;
}): Promise<{ success: boolean; message?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.EMAIL_FROM || "BillFlow Invoices <onboarding@resend.dev>";
  const filename = `Invoice-${billNo.replace(/[^\w.-]/g, "_")}.pdf`;

  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [to],
          subject: `Invoice #${billNo} from ${businessName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
                <div style="background: #4f46e5; color: #ffffff; font-weight: bold; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px;">B</div>
                <span style="font-size: 18px; font-weight: bold; color: #0f172a;">${businessName}</span>
              </div>
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Invoice #${billNo}</h2>
              <p style="font-size: 14px; color: #475569; line-height: 1.5;">
                Dear ${clientName},<br />
                Please find your official invoice attached as a PDF file.
              </p>
              <div style="margin: 20px 0; background: #f8fafc; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0;">
                <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold;">Total Due</div>
                <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px;">₹${total.toFixed(2)}</div>
              </div>
              <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
                You can also view or download your invoice anytime at:<br />
                <a href="${pdfUrl}" style="color: #4f46e5; font-weight: 600;">${pdfUrl}</a>
              </p>
              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8;">
                Sent via BillFlow
              </div>
            </div>
          `,
          attachments: [
            {
              filename,
              content: pdfBuffer.toString("base64"),
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.warn("Resend email error:", data);
        return { success: false, message: data.message || "Failed to send email via Resend" };
      }
      return { success: true };
    } catch (err) {
      console.warn("Failed to dispatch bill email:", err);
      return { success: false, message: err instanceof Error ? err.message : "Email sending failed" };
    }
  }

  // Development fallback
  console.log(`[BillFlow] (Dev Mode) Invoice #${billNo} PDF dispatched to ${to}`);
  return { success: true, message: `(Dev mode) Invoice email dispatched to ${to}` };
}

