import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { effectiveStatus } from "@/lib/bills";
import ClientsManager, { type ClientRow } from "@/components/ClientsManager";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requireUser();
  const clients = await db.client.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    include: { bills: { select: { total: true, status: true, dueDate: true } } },
  });

  const rows: ClientRow[] = clients.map((c) => {
    const statuses = c.bills.map((b) => effectiveStatus(b));
    return {
      id: c.id,
      name: c.name,
      address: c.address,
      phone: c.phone,
      email: c.email,
      gstin: c.gstin,
      billCount: c.bills.length,
      billed: c.bills.reduce((s, b) => s + b.total, 0),
      outstanding: c.bills.filter((_, i) => statuses[i] !== "PAID").reduce((s, b) => s + b.total, 0),
    };
  });

  return <ClientsManager clients={rows} />;
}
