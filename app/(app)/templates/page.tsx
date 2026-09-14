import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseBlocks } from "@/lib/api";
import TemplateCardActions from "@/components/TemplateCardActions";
import { Plus, Sparkles, FileUp, LayoutTemplate } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireUser();
  const templates = await db.template.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { bills: { where: { userId: user.id } } } } },
  });

  const blockLabels: Record<string, string> = {
    hasLogo: "Logo",
    hasSignature: "Signature",
    hasGST: "GST",
    hasBank: "Bank details",
    hasAmountWords: "Amount in words",
    hasHSN: "HSN",
  };

  const sourceBadge: Record<string, { label: string; cls: string }> = {
    ai: { label: "AI made", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    import: { label: "Imported", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    builtin: { label: "Built-in", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    blank: { label: "Custom", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bill templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your bill formats. Create a bill from any template in seconds.
          </p>
        </div>
        <Link href="/templates/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <LayoutTemplate className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-bold text-slate-900">No templates yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Make one from a photo of your bill book with AI, import an HTML/Word file, or start from a
            ready-made format.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/templates/new?tab=ai" className="btn-primary">
              <Sparkles className="h-4 w-4" /> AI Bill Maker
            </Link>
            <Link href="/templates/new?tab=import" className="btn-secondary">
              <FileUp className="h-4 w-4" /> Import
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const blocks = parseBlocks(t.blocks);
            const badge = sourceBadge[t.sourceType] || sourceBadge.blank;
            return (
              <div key={t.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">{t.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${badge.cls}`}>{badge.label}</span>
                      <span>{t.pageFormat}</span>
                      <span>· {t._count.bills} bills</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">
                  {t.description || "No description."}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {Object.entries(blockLabels)
                    .filter(([k]) => (blocks as unknown as Record<string, boolean>)[k])
                    .map(([k, label]) => (
                      <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {label}
                      </span>
                    ))}
                </div>
                <TemplateCardActions id={t.id} name={t.name} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
