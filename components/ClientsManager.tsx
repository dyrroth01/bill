"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, X, Users } from "lucide-react";

export interface ClientRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  billCount: number;
  billed: number;
  outstanding: number;
}

export default function ClientsManager({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<null | {
    id?: string;
    name: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
  }>(null);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setModal({ name: "", address: "", phone: "", email: "", gstin: "" });
  }
  function openEdit(c: ClientRow) {
    setModal({
      id: c.id,
      name: c.name,
      address: c.address || "",
      phone: c.phone || "",
      email: c.email || "",
      gstin: c.gstin || "",
    });
  }

  async function save() {
    if (!modal) return;
    setBusy(true);
    try {
      const res = await fetch(modal.id ? `/api/clients/${modal.id}` : "/api/clients", {
        method: modal.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Save failed");
      } else {
        setModal(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this client? Their bills are kept.")) return;
    setBusy(true);
    try {
      await fetch(`/api/clients/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">{clients.length} clients — auto-added from your bills.</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus className="h-4 w-4" /> Add client
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No clients yet. They appear here when you create bills.</p>
        </div>
      ) : (
        <>
          {/* Mobile Client Cards */}
          <div className="md:hidden mt-4 space-y-3">
            {clients.map((c) => (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base text-slate-900 truncate">{c.name}</div>
                    {c.gstin && (
                      <div className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        GST: {c.gstin}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      title="Edit client"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      disabled={busy}
                      className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"
                      title="Delete client"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {c.address && (
                  <div className="mt-2 text-xs text-slate-500 leading-relaxed">
                    {c.address}
                  </div>
                )}

                {(c.phone || c.email) && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="font-medium text-slate-700 hover:text-indigo-600">
                        📞 {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-indigo-600 hover:underline truncate max-w-[200px]">
                        ✉️ {c.email}
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Bills</div>
                    <div className="mt-0.5 font-bold text-slate-800">{c.billCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Billed</div>
                    <div className="mt-0.5 font-bold text-slate-800">₹{c.billed.toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Outstanding</div>
                    <div className={`mt-0.5 font-bold ${c.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      ₹{c.outstanding.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block card mt-6 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3 text-center">Bills</th>
                  <th className="px-3 py-3 text-right">Billed</th>
                  <th className="px-3 py-3 text-right">Outstanding</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      {c.address && <div className="max-w-64 truncate text-xs text-slate-400">{c.address}</div>}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {c.phone && <div className="font-medium text-slate-700">{c.phone}</div>}
                      {c.email && (
                        <div className="text-xs text-indigo-600 truncate max-w-48 hover:underline">
                          <a href={`mailto:${c.email}`}>{c.email}</a>
                        </div>
                      )}
                      {!c.phone && !c.email && "—"}
                      {c.gstin && <div className="text-xs text-slate-400 mt-0.5">GST: {c.gstin}</div>}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">{c.billCount}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800">₹{c.billed.toFixed(0)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${c.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      ₹{c.outstanding.toFixed(0)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(c.id)} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setModal(null)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{modal.id ? "Edit client" : "Add client"}</h3>
              <button onClick={() => setModal(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Name *</label>
                <input
                  className="field"
                  placeholder="e.g. Acme Corporation"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Address</label>
                <input
                  className="field"
                  placeholder="Street, City, State, PIN"
                  value={modal.address}
                  onChange={(e) => setModal({ ...modal, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input
                    className="field"
                    placeholder="e.g. 9876543210"
                    value={modal.phone}
                    onChange={(e) => setModal({ ...modal, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="field"
                    placeholder="client@example.com"
                    value={modal.email}
                    onChange={(e) => setModal({ ...modal, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">GSTIN</label>
                <input
                  className="field"
                  placeholder="e.g. 27AABCU9603R1ZM"
                  value={modal.gstin}
                  onChange={(e) => setModal({ ...modal, gstin: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={save} disabled={busy || !modal.name.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
