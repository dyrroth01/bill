import SettingsForm from "@/components/SettingsForm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const { getUserUsage } = await import("@/lib/quotas");
  const usage = await getUserUsage(user.id);
  return (
    <SettingsForm
      initial={{
        name: user.name,
        email: user.email,
        businessName: user.businessName || "",
        businessTagline: user.businessTagline || "",
        businessAddress: user.businessAddress || "",
        businessPhone: user.businessPhone || "",
        businessGstin: user.businessGstin || "",
        bankName: user.bankName || "",
        bankAccountNo: user.bankAccountNo || "",
        bankIfsc: user.bankIfsc || "",
        bankUpiId: user.bankUpiId || "",
      }}
      authInfo={{
        hasPassword: Boolean(user.passwordHash),
        isGoogleLinked: Boolean(user.googleId),
      }}
      usage={usage}
    />
  );
}
