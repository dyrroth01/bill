"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, FileText, Trash2, X } from "lucide-react";

export default function TemplateCardActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function openPreview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${id}/preview`);
      const data = await res.json();
      setPreview(data.html || "<p>Preview failed</p>");
    } finally {
      setLoading(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/templates/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
        <Link href={`/bills/new?templateId=${id}`} className="btn-primary flex-1 !py-1.5 text-xs">
          <FileText className="h-3.5 w-3.5" /> New bill
        </Link>
        <button onClick={openPreview} disabled={loading} className="btn-ghost !px-2.5 !py-1.5" title="Preview">
          <Eye className="h-4 w-4" />
        </button>
        <Link href={`/templates/${id}/edit`} className="btn-ghost !px-2.5 !py-1.5" title="Edit">
          <Pencil className="h-4 w-4" />
        </Link>
        <button
          onClick={() => setConfirmDelete(true)}
          className="btn-ghost !px-2.5 !py-1.5 hover:!text-red-600"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setConfirmDelete(false)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900">Delete “{name}”?</h3>
            <p className="mt-2 text-sm text-slate-500">
              Bills created with it keep their PDFs. The template can&apos;t be used for new bills afterwards.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={doDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setPreview(null)}>
          <div className="relative h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl bg-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
              <span className="text-sm font-bold text-slate-800">{name} — sample preview</span>
              <button onClick={() => setPreview(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe title="preview" srcDoc={preview} sandbox="" className="h-[calc(92vh-45px)] w-full bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
