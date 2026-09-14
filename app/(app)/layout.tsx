import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.onboardingDone) redirect("/welcome");

  const { getUserUsage } = await import("@/lib/quotas");
  const usage = await getUserUsage(user.id);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={{
          name: user.name,
          email: user.email,
          businessName: user.businessName,
          plan: user.plan as "free" | "pro",
          hasPassword: Boolean(user.passwordHash),
          googleId: user.googleId,
          avatarUrl: user.avatarUrl,
        }}
        usage={usage}
      />
      <main className="min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:ml-60 lg:px-8">{children}</main>
    </div>
  );
}
