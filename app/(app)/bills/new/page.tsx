import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseBlocks, parseFields } from "@/lib/api";
import { suggestNextBillNo } from "@/lib/bills";
import BillForm from "@/components/BillForm";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ templateId?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const templates = await db.template.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (templates.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-10 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-indigo-300" />
          <h1 className="mt-4 text-lg font-bold text-slate-900">First, create a bill template</h1>
          <p className="mt-2 text-sm text-slate-500">
            A template is your bill&apos;s format (letterhead, table, signature). You only set it up once — then
            every bill takes seconds.
          </p>
          <Link href="/templates/new" className="btn-primary mt-6">
            Create a template
          </Link>
        </div>
      </div>
    );
  }

  const clients = await db.client.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  const last = await db.bill.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { billNo: true },
  });

  const initialTemplateId =
    sp.templateId && templates.some((t) => t.id === sp.templateId) ? sp.templateId : templates[0].id;

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-bold text-slate-900">New bill</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Fill the details — the PDF builds itself on the right.</p>
      <BillForm
        mode="create"
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          pageFormat: t.pageFormat,
          blocks: parseBlocks(t.blocks),
          fields: parseFields(t.fieldSchema),
        }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name, address: c.address, phone: c.phone, email: c.email, gstin: c.gstin }))}
        bank={{ bankName: user.bankName, accountNo: user.bankAccountNo, ifsc: user.bankIfsc, upiId: user.bankUpiId }}
        suggestedBillNo={suggestNextBillNo(last?.billNo)}
        initialTemplateId={initialTemplateId}
      />
    </div>
  );
}
