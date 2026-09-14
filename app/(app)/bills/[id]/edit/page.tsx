import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseBlocks, parseFields } from "@/lib/api";
import BillForm from "@/components/BillForm";
import type { BillDraft } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const bill = await db.bill.findFirst({
    where: { id, userId: user.id },
    include: { client: true },
  });
  if (!bill) notFound();

  const templates = await db.template.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const initialDraft: BillDraft = {
    billNo: bill.billNo,
    billDate: bill.billDate.toISOString().slice(0, 10),
    dueDate: bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : undefined,
    client: {
      name: bill.clientName,
      address: bill.client?.address || "",
      phone: bill.client?.phone || "",
      gstin: bill.client?.gstin || "",
    },
    items: JSON.parse(bill.items || "[]"),
    extra: JSON.parse(bill.extra || "{}"),
    cgstRate: bill.cgstRate,
    sgstRate: bill.sgstRate,
    igstRate: bill.igstRate,
    amountInWords: bill.amountInWords || "",
    notes: bill.notes || "",
    chequeNo: bill.chequeNo || "",
    paidAmount: bill.paidAmount,
    paymentMode: bill.paymentMode || undefined,
    payments: JSON.parse(bill.payments || "[]"),
  };

  return (
    <div className="mx-auto max-w-7xl">
      <Link href={`/bills/${bill.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Back to bill
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Edit bill #{bill.billNo}</h1>
      <BillForm
        mode="edit"
        billId={bill.id}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          pageFormat: t.pageFormat,
          blocks: parseBlocks(t.blocks),
          fields: parseFields(t.fieldSchema),
        }))}
        clients={(await db.client.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } })).map((c) => ({
          id: c.id,
          name: c.name,
          address: c.address,
          phone: c.phone,
          email: c.email,
          gstin: c.gstin,
        }))}
        bank={{ bankName: user.bankName, accountNo: user.bankAccountNo, ifsc: user.bankIfsc, upiId: user.bankUpiId }}
        suggestedBillNo={bill.billNo}
        initialTemplateId={bill.templateId || undefined}
        initialDraft={initialDraft}
        initialStatus={bill.status === "PAID" ? "PAID" : bill.status === "PARTIAL" ? "PARTIAL" : "PENDING"}
      />
    </div>
  );
}
