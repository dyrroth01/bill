import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { effectiveStatus, computeBillBalance } from "@/lib/bills";
import ClientsManager, { type ClientRow } from "@/components/ClientsManager";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requireUser();
  const clients = await db.client.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    include: { bills: { select: { total: true, status: true, dueDate: true, paidAmount: true } } },
  });

  const rows: ClientRow[] = clients.map((c) => {
    return {
      id: c.id,
      name: c.name,
      address: c.address,
      phone: c.phone,
      email: c.email,
      gstin: c.gstin,
      billCount: c.bills.length,
      billed: c.bills.reduce((s, b) => s + b.total, 0),
      outstanding: c.bills.reduce((s, b) => s + computeBillBalance(b).pendingAmount, 0),
    };
  });


  return <ClientsManager clients={rows} />;
}
