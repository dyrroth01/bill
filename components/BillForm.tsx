"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  FileText,
  Banknote,
  ExternalLink,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Eye,
  X,
} from "lucide-react";
import type { BillDraft, BillItem, TemplateBlocks, TemplateField } from "@/lib/types";
import { DEFAULT_UNITS } from "@/lib/types";
import { computeTotals } from "@/lib/context";
import { amountToWords, round2 } from "@/lib/format";

export interface FormTemplate {
  id: string;
  name: string;
  pageFormat: string;
  blocks: TemplateBlocks;
  fields: TemplateField[];
}

export interface FormClient {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  gstin: string | null;
}

export interface BillFormProps {
  templates: FormTemplate[];
  clients: FormClient[];
  bank: { bankName: string | null; accountNo: string | null; ifsc: string | null; upiId: string | null };
  suggestedBillNo: string;
  mode: "create" | "edit";
  billId?: string;
  initialTemplateId?: string;
  initialDraft?: BillDraft;
  initialStatus?: "PAID" | "PARTIAL" | "PENDING";
}

const PAGE_W = { A4: 794, A5: 560 };
const PAGE_H = { A4: 1123, A5: 794 };

// Presets for popular business fields in India
const PRESET_EXTRA_FIELDS = [
  { key: "orderNo", label: "Your Order No. / PO No.", type: "text" as const },
  { key: "orderDate", label: "Order Date / PO Date", type: "date" as const },
  { key: "challanNo", label: "Challan / Delivery No.", type: "text" as const },
  { key: "challanDate", label: "Challan Date", type: "date" as const },
  { key: "vehicleNo", label: "Vehicle Number", type: "text" as const },
  { key: "lrNo", label: "LR / Transport No.", type: "text" as const },
  { key: "ewayBillNo", label: "E-Way Bill Number", type: "text" as const },
  { key: "deliveryNote", label: "Delivery Note / Ref", type: "text" as const },
  { key: "paymentTerms", label: "Payment Terms", type: "text" as const },
  { key: "dispatchThrough", label: "Dispatched Through", type: "text" as const },
  { key: "destination", label: "Destination", type: "text" as const },
  { key: "siteName", label: "Site / Project Name", type: "text" as const },
  { key: "workOrderNo", label: "Work Order No.", type: "text" as const },
];

export default function BillForm(props: BillFormProps) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(props.initialTemplateId || props.templates[0]?.id || "");
  const template = useMemo(() => props.templates.find((t) => t.id === templateId), [templateId, props.templates]);

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [draft, setDraft] = useState<BillDraft>(
    props.initialDraft || {
      billNo: props.suggestedBillNo,
      billDate: today,
      dueDate: in30,
      client: { name: "", address: "", phone: "", gstin: "" },
      items: [{ description: "", hsn: "", qty: 1, unit: "Nos", rate: 0, amount: 0 }],
      extra: Object.fromEntries((template?.fields || []).map((f) => [f.key, ""])),
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 0,
      amountInWords: "",
      notes: "",
      chequeNo: "",
    }
  );
  const [paymentOption, setPaymentOption] = useState<"UNPAID" | "INSTALLMENT" | "PAID">(() => {
    if (props.initialStatus === "PAID") return "PAID";
    if (props.initialStatus === "PARTIAL" || (props.initialDraft?.paidAmount && props.initialDraft.paidAmount > 0)) {
      return "INSTALLMENT";
    }
    return "UNPAID";
  });
  const [installmentPaid, setInstallmentPaid] = useState<string>(() =>
    props.initialDraft?.paidAmount && props.initialDraft.paidAmount > 0
      ? String(props.initialDraft.paidAmount)
      : ""
  );
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "CHEQUE" | "BANK">("CASH");
  const [chequeStatus, setChequeStatus] = useState<"PENDING" | "CLEARED" | "BOUNCED">("PENDING");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const previewHostRef = useRef<HTMLDivElement>(null);

  // Dynamic custom fields adding state
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldPreset, setNewFieldPreset] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "date" | "number">("text");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [saveToTemplate, setSaveToTemplate] = useState(false);

  // Prevent third-party browser extensions or PerformanceObservers from crashing the page on iframe reloads
  useEffect(() => {
    const handleError = (ev: ErrorEvent) => {
      if (
        ev.message &&
        (ev.message.includes("startTime") ||
          ev.message.includes("reportAllChanges") ||
          ev.filename?.includes("<anonymous>"))
      ) {
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
    };
    window.addEventListener("error", handleError, true);
    return () => window.removeEventListener("error", handleError, true);
  }, []);

  const totals = computeTotals(draft.items, draft.cgstRate, draft.sgstRate, draft.igstRate);
  const words = (draft.amountInWords || "").trim() || amountToWords(totals.total);
  const blocks = template?.blocks;

  const invalidCls = (key: string) =>
    fieldErrors[key] ? "!border-red-500 !bg-red-50 ring-1 ring-red-400" : "";

  // Comprehensive client validation
  function validateDraftFields(): Record<string, string> {
    const fe: Record<string, string> = {};
    if (!draft.billNo.trim()) {
      fe.billNo = "Bill number is required";
    }
    if (!draft.billDate || !draft.billDate.trim()) {
      fe.billDate = "Bill date is required";
    }
    if (!draft.client.name.trim()) {
      fe.clientName = "Client / M-s name is required";
    }
    if (!draft.items.length) {
      fe.items = "Add at least one item to the bill";
    } else {
      const hasAny = draft.items.some(
        (it) => it.description.trim().length > 0 || (Number(it.amount) || 0) > 0
      );
      if (!hasAny) {
        fe.items = "Items cannot all be empty — enter description or amount";
      }
      // Check if any row has an amount but no description
      draft.items.forEach((it, idx) => {
        if ((Number(it.amount) || 0) > 0 && !it.description.trim()) {
          fe[`item_${idx}`] = "Description is required for this item";
        }
      });
    }
    return fe;
  }

  const clearFieldError = (key: string) =>
    setFieldErrors((fe) => {
      if (!fe[key]) return fe;
      const next = { ...fe };
      delete next[key];
      return next;
    });

  function focusFirstInvalid(fe: Record<string, string>) {
    const order: Array<[string, string]> = [
      ["billNo", "f-billNo"],
      ["billDate", "f-billDate"],
      ["dueDate", "f-dueDate"],
      ["clientName", "f-clientName"],
      ["clientGstin", "f-clientGstin"],
      ["clientPhone", "f-clientPhone"],
      ["items", "f-items"],
    ];

    // Check item specific errors
    for (let i = 0; i < draft.items.length; i++) {
      order.push([`item_${i}`, `f-item-desc-${i}`]);
    }

    for (const [key, id] of order) {
      if (fe[key]) {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
            (el as HTMLElement).focus();
          }
          break;
        }
      }
    }
  }

  const setDraftField = <K extends keyof BillDraft>(key: K, value: BillDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setClient = (patch: Partial<BillDraft["client"]>) =>
    setDraft((d) => ({ ...d, client: { ...d.client, ...patch } }));

  // Set item quantity or rate (auto-recalculating amount)
  function setItem(i: number, patch: Partial<BillItem>) {
    setDraft((d) => {
      const items = d.items.map((it, idx) => {
        if (idx !== i) return it;
        const next = { ...it, ...patch };
        next.amount = round2((Number(next.qty) || 0) * (Number(next.rate) || 0));
        return next;
      });
      return { ...d, items };
    });
  }

  // Directly set item amount (for lump-sum, service bills, labour charges)
  function setItemDirectAmount(i: number, amount: number) {
    setDraft((d) => {
      const items = d.items.map((it, idx) => {
        if (idx !== i) return it;
        return { ...it, amount: round2(amount) };
      });
      return { ...d, items };
    });
  }

  function addItem() {
    setDraft((d) => ({
      ...d,
      items: [...d.items, { description: "", hsn: "", qty: 1, unit: "Nos", rate: 0, amount: 0 }],
    }));
  }

  function removeItem(i: number) {
    setDraft((d) => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));
  }

  function pickClient(name: string) {
    const existing = props.clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setClient({
        name: existing.name,
        address: existing.address || "",
        gstin: existing.gstin || "",
        phone: existing.phone || "",
        email: existing.email || "",
      });
    } else {
      setClient({ name });
    }
  }

  // Dynamic custom fields list combining template fields and any custom fields added
  const allExtraFields = useMemo(() => {
    const map = new Map<string, { key: string; label: string; type: "text" | "date" | "number" }>();
    // 1. Defined on template
    for (const f of template?.fields || []) {
      map.set(f.key, { key: f.key, label: f.label, type: f.type });
    }
    // 2. Already populated in draft.extra
    for (const [key] of Object.entries(draft.extra)) {
      if (!map.has(key)) {
        const preset = PRESET_EXTRA_FIELDS.find((p) => p.key === key);
        map.set(key, {
          key,
          label: preset?.label || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
          type: preset?.type || "text",
        });
      }
    }
    return Array.from(map.values());
  }, [template?.fields, draft.extra]);

  function handlePresetSelect(presetKey: string) {
    setNewFieldPreset(presetKey);
    const preset = PRESET_EXTRA_FIELDS.find((p) => p.key === presetKey);
    if (preset) {
      setNewFieldKey(preset.key);
      setNewFieldLabel(preset.label);
      setNewFieldType(preset.type);
    } else {
      setNewFieldKey("");
      setNewFieldLabel("");
      setNewFieldType("text");
    }
  }

  async function handleAddCustomField() {
    const key = (newFieldKey || newFieldLabel).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) {
      alert("Please enter a field name or select a preset");
      return;
    }
    // Add to draft extra
    setDraft((d) => ({
      ...d,
      extra: { ...d.extra, [key]: newFieldValue },
    }));

    // Optionally save to template schema so future bills will have it
    if (saveToTemplate && templateId) {
      try {
        const updatedFields = [...(template?.fields || [])];
        if (!updatedFields.some((f) => f.key === key)) {
          updatedFields.push({ key, label: newFieldLabel || key, type: newFieldType });
          await fetch(`/api/templates/${templateId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields: updatedFields }),
          });
        }
      } catch (err) {
        console.warn("Could not save field to template schema:", err);
      }
    }

    // Reset addition modal
    setNewFieldPreset("");
    setNewFieldKey("");
    setNewFieldLabel("");
    setNewFieldValue("");
    setSaveToTemplate(false);
    setShowAddField(false);
  }

  function removeCustomField(key: string) {
    setDraft((d) => {
      const next = { ...d.extra };
      delete next[key];
      return { ...d, extra: next };
    });
  }

  // Live preview (debounced)
  const refreshPreview = useCallback(async () => {
    if (!templateId) return;
    setPreviewing(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json();
      if (res.ok && data.html) setPreviewHtml(data.html);
    } catch {
      // preview error non-fatal
    } finally {
      setPreviewing(false);
    }
  }, [templateId, draft]);

  useEffect(() => {
    const t = setTimeout(refreshPreview, 600);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  // Keep extra fields when template changes
  function switchTemplate(id: string) {
    setTemplateId(id);
    const t = props.templates.find((x) => x.id === id);
    if (t) {
      setDraft((d) => {
        const extra: Record<string, string> = { ...d.extra };
        for (const f of t.fields) {
          if (extra[f.key] === undefined) extra[f.key] = "";
        }
        return { ...d, extra };
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const fe = validateDraftFields();
    setFieldErrors(fe);
    if (Object.keys(fe).length) {
      setError("Please fix the highlighted fields before saving.");
      focusFirstInvalid(fe);
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    // Resilient timeout: 15s max (saving takes <50ms, PDF attempt <5s)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const instVal = parseFloat(installmentPaid) || 0;
      const payload = {
        draft,
        templateId,
        status: paymentOption === "PAID" ? "PAID" : paymentOption === "INSTALLMENT" && instVal > 0 ? "PARTIAL" : "PENDING",
        paymentMode: paymentOption !== "UNPAID" ? paymentMode : null,
        paidAmount: paymentOption === "INSTALLMENT" && instVal > 0 ? instVal : paymentOption === "PAID" ? undefined : undefined,
        chequeNo: draft.chequeNo,
        chequeStatus: paymentOption !== "UNPAID" && paymentMode === "CHEQUE" ? chequeStatus : null,
      };

      const res = await fetch(props.mode === "create" ? "/api/bills" : `/api/bills/${props.billId}`, {
        method: props.mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let data: { id?: string; error?: string; fieldErrors?: Record<string, string> } = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        if (data.fieldErrors && Object.keys(data.fieldErrors).length > 0) {
          setFieldErrors(data.fieldErrors);
          focusFirstInvalid(data.fieldErrors);
        }
        throw new Error(data.error || "Could not save bill");
      }

      setSaveSuccess(true);
      const targetId = data.id || props.billId;

      // Smooth redirection to bill detail view
      setTimeout(() => {
        router.push(`/bills/${targetId}`);
        router.refresh();
      }, 300);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save bill";
      if (controller.signal.aborted) {
        setError("Request timed out. Please check your connection and try again.");
      } else {
        setError(msg);
        const mapped: Record<string, string> = { ...fieldErrors };
        if (/bill number|bill no/i.test(msg)) mapped.billNo = msg;
        else if (/bill date|valid date/i.test(msg)) mapped.billDate = msg;
        else if (/due date/i.test(msg)) mapped.dueDate = msg;
        else if (/client/i.test(msg)) mapped.clientName = msg;
        else if (/item/i.test(msg)) mapped.items = msg;

        if (Object.keys(mapped).length) {
          setFieldErrors(mapped);
          focusFirstInvalid(mapped);
        }
      }
      setSaving(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  const pageW = PAGE_W[(template?.pageFormat as "A4" | "A5") || "A5"];
  const pageH = PAGE_H[(template?.pageFormat as "A4" | "A5") || "A5"];

  return (
    <form onSubmit={submit} className="grid items-start gap-6 xl:grid-cols-[1fr_540px]">
      {/* ------------------------------ form column ------------------------------ */}
      <div className="space-y-5">
        {/* Prominent Error Banner at Top */}
        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 shadow-sm animate-fadeIn">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-900">Please fix the highlighted errors below</h3>
                <p className="mt-1 text-xs text-red-700">{error}</p>
                {Object.keys(fieldErrors).length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-xs text-red-600 space-y-0.5">
                    {Object.entries(fieldErrors).map(([k, msg]) => (
                      <li key={k}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Bill template</label>
              <select className="field" value={templateId} onChange={(e) => switchTemplate(e.target.value)}>
                {props.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.pageFormat})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label flex items-center justify-between">
                <span>Bill number *</span>
                {fieldErrors.billNo && <span className="text-[11px] text-red-600 font-semibold">Required</span>}
              </label>
              <input
                id="f-billNo"
                className={`field ${invalidCls("billNo")}`}
                placeholder="e.g. 101, 2024-01"
                value={draft.billNo}
                onChange={(e) => {
                  clearFieldError("billNo");
                  setDraftField("billNo", e.target.value);
                }}
              />
              {fieldErrors.billNo && (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {fieldErrors.billNo}
                </p>
              )}
            </div>
            <div>
              <label className="label flex items-center justify-between">
                <span>Bill date *</span>
                {fieldErrors.billDate && <span className="text-[11px] text-red-600 font-semibold">Required</span>}
              </label>
              <input
                id="f-billDate"
                type="date"
                className={`field ${invalidCls("billDate")}`}
                value={draft.billDate}
                onChange={(e) => {
                  clearFieldError("billDate");
                  setDraftField("billDate", e.target.value);
                }}
              />
              {fieldErrors.billDate && (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {fieldErrors.billDate}
                </p>
              )}
            </div>
            <div>
              <label className="label">Due date (overdue after this)</label>
              <input
                id="f-dueDate"
                type="date"
                className={`field ${invalidCls("dueDate")}`}
                value={draft.dueDate || ""}
                onChange={(e) => {
                  clearFieldError("dueDate");
                  setDraftField("dueDate", e.target.value);
                }}
              />
              {fieldErrors.dueDate && (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {fieldErrors.dueDate}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 text-sm font-bold text-slate-900">Bill to</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label flex items-center justify-between">
                <span>Client / M-s name *</span>
                {fieldErrors.clientName && <span className="text-[11px] text-red-600 font-semibold">Required</span>}
              </label>
              <input
                id="f-clientName"
                className={`field ${invalidCls("clientName")}`}
                list="client-list"
                placeholder="Start typing — existing clients appear"
                value={draft.client.name}
                onChange={(e) => {
                  clearFieldError("clientName");
                  pickClient(e.target.value);
                }}
              />
              {fieldErrors.clientName && (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {fieldErrors.clientName}
                </p>
              )}
              <datalist id="client-list">
                {props.clients.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input
                id="f-clientAddress"
                className="field"
                placeholder="Client address / locality"
                value={draft.client.address || ""}
                onChange={(e) => setClient({ address: e.target.value })}
              />
            </div>
            <div>
              <label className="label">GSTIN (client)</label>
              <input
                id="f-clientGstin"
                className={`field ${invalidCls("clientGstin")}`}
                placeholder="e.g. 27AABCU9603R1ZM"
                value={draft.client.gstin || ""}
                onChange={(e) => {
                  clearFieldError("clientGstin");
                  setClient({ gstin: e.target.value.toUpperCase() });
                }}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                id="f-clientPhone"
                className={`field ${invalidCls("clientPhone")}`}
                placeholder="e.g. 9876543210"
                value={draft.client.phone || ""}
                onChange={(e) => {
                  clearFieldError("clientPhone");
                  setClient({ phone: e.target.value });
                }}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                id="f-clientEmail"
                type="email"
                className="field"
                placeholder="client@example.com"
                value={draft.client.email || ""}
                onChange={(e) => setClient({ email: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* ----------------- DYNAMIC & CUSTOM EXTRA FIELDS ----------------- */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">Extra & Custom fields</div>
              <p className="text-xs text-slate-500">Add any bill-specific fields (PO No, Challan, Vehicle, etc.)</p>
            </div>
            {!showAddField && (
              <button
                type="button"
                onClick={() => setShowAddField(true)}
                className="btn-secondary !py-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add custom field
              </button>
            )}
          </div>

          {allExtraFields.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {allExtraFields.map((f) => (
                <div key={f.key} className="relative group">
                  <div className="flex items-center justify-between">
                    <label className="label !mb-1 text-xs">{f.label}</label>
                    <button
                      type="button"
                      onClick={() => removeCustomField(f.key)}
                      className="text-slate-300 hover:text-red-500 p-0.5"
                      title="Remove field from this bill"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                    className="field"
                    placeholder={`Enter ${f.label.toLowerCase()}`}
                    value={draft.extra[f.key] || ""}
                    onChange={(e) => setDraftField("extra", { ...draft.extra, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No extra fields yet. Click &quot;Add custom field&quot; to add one.</p>
          )}

          {/* Inline Add Field Box */}
          {showAddField && (
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <div className="text-xs font-bold text-indigo-900 mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Add dynamic field to this bill
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label className="label text-xs">Quick preset</label>
                  <select
                    className="field !py-1.5 text-xs"
                    value={newFieldPreset}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                  >
                    <option value="">-- Choose preset or enter custom below --</option>
                    {PRESET_EXTRA_FIELDS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Field label *</label>
                  <input
                    className="field !py-1.5 text-xs"
                    placeholder="e.g. Challan No."
                    value={newFieldLabel}
                    onChange={(e) => {
                      setNewFieldLabel(e.target.value);
                      if (!newFieldPreset) {
                        setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="label text-xs">Field type</label>
                  <select
                    className="field !py-1.5 text-xs"
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as "text" | "date" | "number")}
                  >
                    <option value="text">Text</option>
                    <option value="date">Date</option>
                    <option value="number">Number</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Value</label>
                  <input
                    type={newFieldType === "date" ? "date" : newFieldType === "number" ? "number" : "text"}
                    className="field !py-1.5 text-xs"
                    placeholder="Value for this bill"
                    value={newFieldValue}
                    onChange={(e) => setNewFieldValue(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-indigo-100 pt-3">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveToTemplate}
                    onChange={(e) => setSaveToTemplate(e.target.checked)}
                    className="rounded text-indigo-600 accent-indigo-600"
                  />
                  <span>Save this field to template schema for future bills</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddField(false)}
                    className="rounded px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    className="btn-primary !py-1 !px-3 text-xs"
                  >
                    Add Field
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ----------------- ITEMS TABLE ----------------- */}
        <div id="f-items" className={`card p-5 ${fieldErrors.items ? "border-red-400 bg-red-50/20" : ""}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-900">Items / Particulars</span>
              <p className="text-xs text-slate-500">Edit Qty × Rate or directly type the Amount (for labour/fixed charges)</p>
            </div>
            <button type="button" onClick={addItem} className="btn-secondary !py-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add item
            </button>
          </div>
          {fieldErrors.items && (
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {fieldErrors.items}
            </p>
          )}
          {/* Mobile Item Cards */}
          <div className="md:hidden space-y-3">
            {draft.items.map((it, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item #{i + 1}</span>
                  {draft.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      title="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div>
                  <label className="label text-[11px]">Description *</label>
                  <input
                    id={`f-item-desc-mob-${i}`}
                    className={`field !py-1.5 ${fieldErrors[`item_${i}`] ? "!border-red-400 !bg-red-50" : ""}`}
                    placeholder="Work / item description"
                    value={it.description}
                    onChange={(e) => {
                      clearFieldError("items");
                      clearFieldError(`item_${i}`);
                      setItem(i, { description: e.target.value });
                    }}
                  />
                  {fieldErrors[`item_${i}`] && (
                    <p className="mt-1 text-[11px] font-medium text-red-600">{fieldErrors[`item_${i}`]}</p>
                  )}
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {blocks?.hasHSN && (
                    <div className="col-span-3">
                      <label className="label text-[11px]">HSN code</label>
                      <input
                        className="field !py-1.5 text-xs"
                        placeholder="HSN"
                        value={it.hsn || ""}
                        onChange={(e) => setItem(i, { hsn: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <label className="label text-[11px]">Qty</label>
                    <input
                      type="number"
                      step="any"
                      className="field !py-1.5 text-xs text-right"
                      value={it.qty}
                      onChange={(e) => setItem(i, { qty: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label text-[11px]">Unit</label>
                    <input
                      className="field !py-1.5 text-xs"
                      list="unit-list"
                      value={it.unit || ""}
                      onChange={(e) => setItem(i, { unit: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-[11px]">Rate ₹</label>
                    <input
                      type="number"
                      step="any"
                      className="field !py-1.5 text-xs text-right"
                      value={it.rate}
                      onChange={(e) => setItem(i, { rate: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]">Amount ₹</label>
                    <input
                      type="number"
                      step="any"
                      className="field !py-1.5 text-xs bg-white text-right font-bold text-slate-900"
                      title="Amount (auto-calculated from Qty × Rate or override)"
                      value={it.amount}
                      onChange={(e) => setItemDirectAmount(i, Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="w-8 pb-2">#</th>
                  <th className="pb-2">Description *</th>
                  {blocks?.hasHSN && <th className="w-24 pb-2">HSN</th>}
                  <th className="w-16 pb-2">Qty</th>
                  <th className="w-20 pb-2">Unit</th>
                  <th className="w-24 pb-2">Rate ₹</th>
                  <th className="w-28 pb-2 text-right">Amount ₹</th>
                  <th className="w-8 pb-2" />
                </tr>
              </thead>
              <tbody>
                {draft.items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1.5 text-xs text-slate-400">{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        id={`f-item-desc-${i}`}
                        className={`field !py-1.5 ${fieldErrors[`item_${i}`] ? "!border-red-400 !bg-red-50" : ""}`}
                        placeholder="Work / item description"
                        value={it.description}
                        onChange={(e) => {
                          clearFieldError("items");
                          clearFieldError(`item_${i}`);
                          setItem(i, { description: e.target.value });
                        }}
                      />
                      {fieldErrors[`item_${i}`] && (
                        <p className="mt-1 text-[11px] font-medium text-red-600">{fieldErrors[`item_${i}`]}</p>
                      )}
                    </td>
                    {blocks?.hasHSN && (
                      <td className="py-1.5 pr-2">
                        <input
                          className="field !py-1.5"
                          placeholder="HSN"
                          value={it.hsn || ""}
                          onChange={(e) => setItem(i, { hsn: e.target.value })}
                        />
                      </td>
                    )}
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        step="any"
                        className="field !py-1.5 text-right"
                        value={it.qty}
                        onChange={(e) => setItem(i, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="field !py-1.5"
                        list="unit-list"
                        value={it.unit || ""}
                        onChange={(e) => setItem(i, { unit: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        step="any"
                        className="field !py-1.5 text-right"
                        value={it.rate}
                        onChange={(e) => setItem(i, { rate: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        step="any"
                        className="field !py-1.5 bg-slate-50/70 text-right font-semibold focus:bg-white"
                        title="Amount (auto calculated or enter directly)"
                        value={it.amount}
                        onChange={(e) => setItemDirectAmount(i, Number(e.target.value))}
                      />
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <datalist id="unit-list">
            {DEFAULT_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        {/* ----------------- GST & TOTALS ----------------- */}
        <div className="card p-5">
          {(!blocks || blocks.hasGST) && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">CGST %</label>
                <input
                  type="number"
                  step="any"
                  className="field"
                  value={draft.cgstRate}
                  onChange={(e) => setDraftField("cgstRate", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">SGST %</label>
                <input
                  type="number"
                  step="any"
                  className="field"
                  value={draft.sgstRate}
                  onChange={(e) => setDraftField("sgstRate", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">IGST %</label>
                <input
                  type="number"
                  step="any"
                  className="field"
                  value={draft.igstRate}
                  onChange={(e) => setDraftField("igstRate", Number(e.target.value))}
                />
              </div>
            </div>
          )}
          <div className={`${!blocks || blocks.hasGST ? "mt-4 " : ""}space-y-1.5 border-t border-slate-100 pt-4 text-sm`}>
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>₹ {totals.subtotal.toFixed(2)}</span>
            </div>
            {draft.cgstRate > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>CGST ({draft.cgstRate}%)</span>
                <span>₹ {totals.cgst.toFixed(2)}</span>
              </div>
            )}
            {draft.sgstRate > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>SGST ({draft.sgstRate}%)</span>
                <span>₹ {totals.sgst.toFixed(2)}</span>
              </div>
            )}
            {draft.igstRate > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>IGST ({draft.igstRate}%)</span>
                <span>₹ {totals.igst.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Total</span>
              <span>₹ {totals.total.toFixed(2)}</span>
            </div>
            {(!blocks || blocks.hasAmountWords) && <div className="pt-2 text-xs text-slate-500">{words}</div>}
          </div>
          {(!blocks || blocks.hasAmountWords) && (
            <div className="mt-3">
              <label className="label">Amount in words (auto — edit to override)</label>
              <input
                className="field"
                placeholder={amountToWords(totals.total)}
                value={draft.amountInWords}
                onChange={(e) => setDraftField("amountInWords", e.target.value)}
              />
            </div>
          )}
        </div>

        {/* ----------------- BANK & NOTES ----------------- */}
        <div className="card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {blocks?.hasBank && (
              <div className="sm:col-span-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Bank block is on for this template.</span> It prints:{" "}
                {[props.bank.bankName, props.bank.accountNo && `A/c ${props.bank.accountNo}`, props.bank.ifsc, props.bank.upiId]
                  .filter(Boolean)
                  .join(" · ") || "no bank details yet"}
                .{" "}
                <a href="/settings" className="font-semibold text-indigo-600 hover:underline">
                  Edit in Settings <ExternalLink className="inline h-3 w-3" />
                </a>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">Notes / terms (printed on bill)</label>
              <textarea rows={2} className="field" value={draft.notes} onChange={(e) => setDraftField("notes", e.target.value)} />
            </div>
          </div>
        </div>

        {/* ----------------- PAYMENT STATUS ----------------- */}
        <div className="card p-5">
          <div className="text-sm font-semibold text-slate-800 mb-3">Payment status</div>

          {/* Payment Option Selector */}
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPaymentOption("UNPAID")}
              className={`flex-1 rounded-md py-1.5 transition ${
                paymentOption === "UNPAID" ? "bg-white text-slate-800 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Unpaid / Pending
            </button>
            <button
              type="button"
              onClick={() => setPaymentOption("INSTALLMENT")}
              className={`flex-1 rounded-md py-1.5 transition ${
                paymentOption === "INSTALLMENT" ? "bg-white text-indigo-700 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Pay in Installment
            </button>
            <button
              type="button"
              onClick={() => setPaymentOption("PAID")}
              className={`flex-1 rounded-md py-1.5 transition ${
                paymentOption === "PAID" ? "bg-white text-emerald-700 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Fully Paid
            </button>
          </div>

          {/* Installment amount + live equation */}
          {paymentOption === "INSTALLMENT" && (
            <div className="mt-4">
              <label className="label">Amount paid now (advance / first installment)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 5000"
                  value={installmentPaid}
                  onChange={(e) => setInstallmentPaid(e.target.value)}
                  className="field !pl-7 font-bold text-slate-800"
                />
              </div>
              {/* Live equation box */}
              {parseFloat(installmentPaid) > 0 && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 mb-1.5">Formula calculation</div>
                  <div className="flex flex-wrap items-center gap-2 font-mono font-semibold text-slate-800 bg-white/80 rounded-lg px-3 py-2 border border-indigo-100">
                    <span>Total: ₹<span className="text-slate-900">{(totals?.total ?? 0).toFixed(2)}</span></span>
                    <span className="text-indigo-500 font-bold">−</span>
                    <span className="text-emerald-700">Paid: ₹{(parseFloat(installmentPaid) || 0).toFixed(2)}</span>
                    <span className="text-indigo-500 font-bold">=</span>
                    <span className="text-amber-700 font-bold">
                      Pending: ₹{Math.max(0, (totals?.total ?? 0) - (parseFloat(installmentPaid) || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-indigo-700 font-semibold">
                    Bill will be saved as <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                      {(parseFloat(installmentPaid) || 0) >= (totals?.total ?? 0) ? "FULLY PAID" : "PARTIALLY PAID"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment mode & cheque (shown for both PAID and INSTALLMENT) */}
          {paymentOption !== "UNPAID" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Payment mode</label>
                <select className="field" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as never)}>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / Online</option>
                  <option value="BANK">Bank transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              {paymentMode === "CHEQUE" && (
                <>
                  <div>
                    <label className="label">Cheque number</label>
                    <input className="field" value={draft.chequeNo || ""} onChange={(e) => setDraftField("chequeNo", e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Cheque status</label>
                    <select className="field" value={chequeStatus} onChange={(e) => setChequeStatus(e.target.value as never)}>
                      <option value="PENDING">Pending clearance</option>
                      <option value="CLEARED">Cleared</option>
                      <option value="BOUNCED">Bounced</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom Error Message */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-6">
          <button type="submit" disabled={saving || saveSuccess} className="btn-primary w-full sm:w-auto px-6 min-w-[160px] justify-center">
            {saveSuccess ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Saved! Redirecting…
              </>
            ) : saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving bill…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" /> {props.mode === "create" ? "Create bill & PDF" : "Save changes"}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowMobilePreview(true)}
            className="btn-secondary w-full sm:w-auto xl:hidden justify-center"
          >
            <Eye className="h-4 w-4" /> Preview Bill
          </button>
          <button type="button" onClick={() => router.back()} disabled={saving} className="btn-secondary w-full sm:w-auto justify-center">
            Cancel
          </button>
        </div>
      </div>

      {/* ----------------------------- preview column (desktop) ---------------------------- */}
      <div className="sticky top-4 hidden xl:block">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Live preview {previewing && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
              className="rounded border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
            >
              −
            </button>
            <span className="w-10 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
              className="rounded border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
            >
              +
            </button>
          </div>
        </div>
        <div ref={previewHostRef} className="h-[85vh] overflow-auto rounded-xl border border-slate-200 bg-slate-200 p-3">
          <div style={{ width: pageW * zoom, height: pageH * zoom }} className="relative">
            <iframe
              key={`bill-preview-${templateId}`}
              title="bill-preview"
              sandbox=""
              loading="lazy"
              srcDoc={previewHtml}
              style={{ width: pageW, height: pageH, transform: `scale(${zoom})`, transformOrigin: "top left" }}
              className="absolute left-0 top-0 border-0 bg-white shadow-md"
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Banknote className="h-3 w-3" /> Logo & signature appear automatically from the template. GST totals calculate themselves.
        </div>
      </div>

      {/* Mobile Live Preview Modal (< xl screens) */}
      {showMobilePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 xl:hidden"
          onClick={() => setShowMobilePreview(false)}
        >
          <div
            className="relative flex h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-bold text-slate-800">Bill Preview ({template?.name})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMobilePreview(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-200 p-2 sm:p-4 text-center">
              <div className="inline-block max-w-full">
                <iframe
                  title="mobile-bill-preview"
                  sandbox=""
                  srcDoc={previewHtml}
                  style={{ width: pageW, minWidth: pageW, height: pageH }}
                  className="border-0 bg-white shadow-md rounded-sm block mx-auto"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
