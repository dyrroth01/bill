"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Loader2, Plus, Image as ImageIcon, PenTool, Code2, HelpCircle } from "lucide-react";
import type { TemplateBlocks, TemplateField } from "@/lib/types";
import { sampleDraft } from "@/lib/sample-data";

const FLAG_LABELS: [keyof TemplateBlocks, string][] = [
  ["hasLogo", "Logo"],
  ["hasSignature", "Signature"],
  ["hasGST", "GST / tax box"],
  ["hasBank", "Bank details"],
  ["hasAmountWords", "Amount in words"],
  ["hasHSN", "HSN codes"],
];

const PLACEHOLDERS = `SELLER      {{seller.name}} {{seller.tagline}} {{seller.address}} {{seller.phone}} {{seller.gstin}}
CLIENT      {{client.name}} {{client.address}} {{client.phone}} {{client.gstin}}
BILL        {{billNo}} {{billDate}} {{dueDate}}
ITEMS       {{#each items}} {{sr}} {{description}} {{hsn}} {{qtyDisplay}} {{rateFmt}} {{amountFmt}} {{/each}}
TOTALS      {{totals.subtotalFmt}} {{totals.cgstFmt}} {{totals.sgstFmt}} {{totals.igstFmt}} {{totals.totalFmt}} {{totals.totalInWords}}
TAX RATES   {{tax.cgstRate}} {{tax.sgstRate}} {{tax.igstRate}}
BANK        {{bank.bankName}} {{bank.accountNo}} {{bank.ifsc}} {{bank.upiId}}
OTHER       {{chequeNo}} {{notes}} {{extra.fieldKey}}
FLAGS       {{#if hasLogo}}…{{/if}} {{#if hasSignature}} {{#if hasGST}} {{#if hasBank}} {{#if hasAmountWords}} {{#if hasHSN}}
IMAGES      {{#if hasLogo}}<img src="{{logoUrl}}">{{/if}}  {{#if hasSignature}}<img src="{{signatureUrl}}">{{/if}}`;

export interface EditorTemplate {
  id: string;
  name: string;
  description: string;
  html: string;
  pageFormat: "A4" | "A5";
  blocks: TemplateBlocks;
  fields: TemplateField[];
  logoAssetId: string | null;
  signatureAssetId: string | null;
  sourceType: string;
}

export default function TemplateEditor({ template }: { template: EditorTemplate }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [pageFormat, setPageFormat] = useState(template.pageFormat);
  const [blocks, setBlocks] = useState<TemplateBlocks>(template.blocks);
  const [fields, setFields] = useState<TemplateField[]>(template.fields);
  const [html, setHtml] = useState(template.html);
  const [logoAssetId, setLogoAssetId] = useState(template.logoAssetId);
  const [signatureAssetId, setSignatureAssetId] = useState(template.signatureAssetId);
  const [previewHtml, setPreviewHtml] = useState("");
  const [renderError, setRenderError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);

  // live preview (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/templates/${template.id}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: { ...sampleDraft(), extra: {} } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Preview failed");
        setPreviewHtml(data.html);
        setRenderError("");
      } catch (e) {
        setRenderError(e instanceof Error ? e.message : "Preview failed");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [template.id, blocks, logoAssetId, signatureAssetId]);

  async function uploadAsset(kind: "logo" | "signature", file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/assets", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Upload failed");
    if (kind === "logo") setLogoAssetId(data.id);
    else setSignatureAssetId(data.id);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pageFormat, blocks, fields, html, logoAssetId, signatureAssetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSaved(true);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit template</h1>
          <p className="mt-1 text-sm text-slate-500">{template.description || "Customize your bill format."}</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-semibold text-emerald-600">Saved ✓</span>}
          <Link href={`/bills/new?templateId=${template.id}`} className="btn-secondary">
            Create bill
          </Link>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* settings column */}
        <div className="space-y-4">
          <div className="card p-4">
            <label className="label">Template name</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="label mt-3">Page size</label>
            <div className="flex gap-2">
              {(["A5", "A4"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPageFormat(f)}
                  className={`btn flex-1 !py-1.5 text-xs ${pageFormat === f ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 text-sm font-bold text-slate-900">Sections</div>
            <div className="flex flex-wrap gap-2">
              {FLAG_LABELS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setBlocks({ ...blocks, [key]: !blocks[key] })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    blocks[key] ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {blocks[key] ? "✓ " : "+ "}
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Toggles only show/hide sections whose <code>{"{{#if …}}"}</code> blocks exist in the HTML.
            </p>
          </div>

          <div className="card p-4">
            <div className="mb-2 text-sm font-bold text-slate-900">Logo & signature</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <ImageIcon className="h-3.5 w-3.5" /> Logo
                </div>
                <div className="flex h-16 items-center justify-center rounded-lg bg-slate-50">
                  {logoAssetId ? (
                    <img src={`/api/assets/${logoAssetId}`} alt="logo" className="max-h-16 max-w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-400">None</span>
                  )}
                </div>
                <div className="mt-2 flex justify-center gap-1">
                  <button onClick={() => logoRef.current?.click()} className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                    Upload
                  </button>
                  {logoAssetId && (
                    <button onClick={() => setLogoAssetId(null)} className="rounded border border-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-50">
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <PenTool className="h-3.5 w-3.5" /> Signature
                </div>
                <div className="flex h-16 items-center justify-center rounded-lg bg-slate-50">
                  {signatureAssetId ? (
                    <img src={`/api/assets/${signatureAssetId}`} alt="signature" className="max-h-16 max-w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-400">None</span>
                  )}
                </div>
                <div className="mt-2 flex justify-center gap-1">
                  <button onClick={() => sigRef.current?.click()} className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                    Upload
                  </button>
                  {signatureAssetId && (
                    <button onClick={() => setSignatureAssetId(null)} className="rounded border border-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-50">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset("logo", e.target.files[0])} />
            <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAsset("signature", e.target.files[0])} />
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Extra fields</span>
              <button
                onClick={() => setFields([...fields, { key: `field${fields.length + 1}`, label: "New field", type: "text" }])}
                className="btn-ghost !px-2 !py-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {fields.length === 0 && <p className="text-xs text-slate-400">No custom fields (e.g. Order No.).</p>}
              {fields.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    className="field !px-2 !py-1.5 text-xs"
                    value={f.label}
                    onChange={(e) => {
                      const next = [...fields];
                      next[i] = { ...f, label: e.target.value };
                      setFields(next);
                    }}
                  />
                  <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-1 text-[10px] text-slate-500">{`{{extra.${f.key}}}`}</span>
                  <button
                    onClick={() => setFields(fields.filter((x) => x !== f))}
                    className="btn-ghost !px-1.5 !py-1 text-xs text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <details className="card p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-900">
              <HelpCircle className="h-4 w-4 text-indigo-500" /> Placeholder cheat-sheet
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-300">{PLACEHOLDERS}</pre>
          </details>
        </div>

        {/* html + preview column */}
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="card flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">
              <Code2 className="h-4 w-4 text-indigo-500" /> Template HTML (Handlebars)
            </div>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              className="h-[70vh] w-full resize-none bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 outline-none"
            />
          </div>
          <div className="card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-bold text-slate-700">Live preview (sample data)</span>
              {renderError && <span className="text-xs font-semibold text-red-500">render error</span>}
            </div>
            {renderError ? (
              <div className="p-4 text-xs text-red-600">{renderError}</div>
            ) : (
              <iframe title="editor-preview" srcDoc={previewHtml} sandbox="" className="h-[70vh] w-full bg-white" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
