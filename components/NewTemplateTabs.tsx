"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  FileUp,
  LayoutTemplate,
  Upload,
  Wand2,
  RotateCcw,
  Pencil,
  FileText,
  Image as ImageIcon,
  PenTool,
  Loader2,
  AlertCircle,
  Zap,
} from "lucide-react";
import UpgradeModal from "./UpgradeModal";
import { DEFAULT_BLOCKS, type BillAnalysis, type TemplateBlocks } from "@/lib/types";

type BuiltinCard = {
  id: string;
  name: string;
  description: string;
  pageFormat: string;
  blocks: TemplateBlocks;
  previewHtml: string;
};

const FLAG_LABELS: [keyof typeof DEFAULT_BLOCKS, string][] = [
  ["hasLogo", "Logo"],
  ["hasSignature", "Signature"],
  ["hasGST", "GST / tax box"],
  ["hasBank", "Bank details"],
  ["hasAmountWords", "Amount in words"],
  ["hasHSN", "HSN codes"],
];

export default function NewTemplateTabs({
  initialTab,
  builtins,
}: {
  initialTab: "ai" | "import" | "builtin";
  builtins: BuiltinCard[];
}) {
  const [tab, setTab] = useState(initialTab);
  const tabs = [
    { id: "ai", label: "AI Bill Maker", icon: Sparkles },
    { id: "import", label: "Import file", icon: FileUp },
    { id: "builtin", label: "Ready templates", icon: LayoutTemplate },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">New bill template</h1>
      <p className="mt-1 text-sm text-slate-500">
        One-time setup — after this, every bill is just a quick form.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`btn ${tab === t.id ? "bg-indigo-600 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "ai" && <AiMakerFlow />}
        {tab === "import" && <ImportFlow />}
        {tab === "builtin" && <BuiltinGallery builtins={builtins} />}
      </div>
    </div>
  );
}

/* ---------------------------------- AI flow --------------------------------- */

function AiMakerFlow() {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "review" | "generated">("upload");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<BillAnalysis | null>(null);
  const [sourceAssetId, setSourceAssetId] = useState("");
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [signatureAssetId, setSignatureAssetId] = useState<string | null>(null);
  const [pageFormat, setPageFormat] = useState<"A4" | "A5">("A5");
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ id: string; previewHtml: string; mock: boolean } | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [usage, setUsage] = useState<{ isPro: boolean; aiGenerationsUsed: number; aiGenerationsRemaining: number | null } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const logoReplaceRef = useRef<HTMLInputElement>(null);
  const sigReplaceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setAiEnabled(Boolean(d.user?.aiEnabled));
        if (d.user) {
          setUsage({
            isPro: Boolean(d.user.isPro),
            aiGenerationsUsed: Number(d.user.aiGenerationsUsed || 0),
            aiGenerationsRemaining: d.user.aiGenerationsRemaining,
          });
        }
      })
      .catch(() => {});
  }, []);

  async function analyze(file: File) {
    if (usage && !usage.isPro && usage.aiGenerationsRemaining !== null && usage.aiGenerationsRemaining <= 0) {
      setShowUpgradeModal(true);
      return;
    }
    setError("");
    setAnalyzing(true);
    setImageUrl(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/analyze-bill", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysis(data.analysis);
      setSourceAssetId(data.sourceAssetId);
      setLogoAssetId(data.logoAssetId || null);
      setSignatureAssetId(data.signatureAssetId || null);
      setName(data.analysis.businessName ? `${data.analysis.businessName} — Bill Format` : "My Bill Template");
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function replaceAsset(kind: "logo" | "signature", file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/assets", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Upload failed");
    if (kind === "logo") setLogoAssetId(data.id);
    else setSignatureAssetId(data.id);
  }

  async function generate() {
    if (!analysis) return;
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, sourceAssetId, logoAssetId, signatureAssetId, pageFormat, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setResult(data);
      setStep("generated");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function reset() {
    setStep("upload");
    setImageUrl(null);
    setAnalysis(null);
    setResult(null);
    setError("");
  }

  const isQuotaExhausted = Boolean(usage && !usage.isPro && usage.aiGenerationsRemaining !== null && usage.aiGenerationsRemaining <= 0);

  /* -------- upload step -------- */
  if (step === "upload") {
    return (
      <div>
        {/* Quota indicator */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
              usage?.isPro ? "bg-amber-100 text-amber-900" : "bg-indigo-50 text-indigo-700"
            }`}>
              {usage?.isPro ? <Zap className="h-3 w-3 fill-amber-500 text-amber-600" /> : <Sparkles className="h-3 w-3" />}
              {usage?.isPro ? "Pro Plan" : "Freemium"}
            </span>
            <span className="text-xs text-slate-600">
              {usage?.isPro
                ? "Unlimited AI template generations active"
                : `${usage?.aiGenerationsRemaining ?? 5} of 5 free AI template generations remaining`}
            </span>
          </div>

          {!usage?.isPro && (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              Get unlimited ($5/mo) →
            </button>
          )}
        </div>

        {isQuotaExhausted ? (
          <div className="card p-8 text-center border-amber-200 bg-amber-50/50">
            <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
            <h3 className="mt-3 text-lg font-bold text-slate-900">
              Free AI Generation Limit Reached (5/5 Used)
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              You have used all 5 free AI template generations on the Freemium plan.
              Upgrade to the Pro plan for $5/month for unlimited AI templates, 10GB cloud storage, and zero ads.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="btn-primary"
              >
                <Zap className="h-4 w-4" /> Upgrade to Pro for $5/mo
              </button>
            </div>
          </div>
        ) : (
          <label className="card block cursor-pointer p-10 text-center transition hover:border-indigo-300 hover:shadow-md">
            <input
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) analyze(f);
              }}
            />
            {analyzing ? (
              <>
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-500" />
                <div className="mt-4 font-bold text-slate-900">Reading your bill…</div>
                <div className="mt-1 text-sm text-slate-500">
                  Detecting letterhead, logo, signature, GST fields and table layout.
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="mt-4 font-bold text-slate-900">Upload a bill photo or PDF</div>
                <div className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  Take a photo of one page of your bill book (or a printed invoice / PDF). One clear page works best —
                  flat, well-lit, full bill in frame.
                </div>
              </>
            )}
          </label>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={usage?.isPro ? "pro" : "free"}
          onSuccess={() => {
            fetch("/api/auth/me")
              .then((r) => r.json())
              .then((d) => {
                if (d.user) {
                  setUsage({
                    isPro: Boolean(d.user.isPro),
                    aiGenerationsUsed: Number(d.user.aiGenerationsUsed || 0),
                    aiGenerationsRemaining: d.user.aiGenerationsRemaining,
                  });
                }
              });
          }}
        />
      </div>
    );
  }

  /* -------- generated step -------- */
  if (step === "generated" && result) {
    return (
      <div>
        {result.mock && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Saved without AI (demo mode) using the closest built-in layout — edit it freely in the template editor.
          </div>
        )}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <div className="font-bold text-slate-900">🎉 Template created — sample preview</div>
            <div className="flex gap-2">
              <Link href={`/templates/${result.id}/edit`} className="btn-secondary !py-1.5 text-xs">
                <Pencil className="h-3.5 w-3.5" /> Edit template
              </Link>
              <Link href={`/bills/new?templateId=${result.id}`} className="btn-primary !py-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> Create a bill now
              </Link>
            </div>
          </div>
          <iframe title="generated" srcDoc={result.previewHtml} sandbox="" className="h-[75vh] w-full bg-white" />
        </div>
        <button onClick={reset} className="btn-ghost mt-4">
          <RotateCcw className="h-4 w-4" /> Make another template
        </button>
      </div>
    );
  }

  /* -------- review step -------- */
  const flags = analysis?.flags || DEFAULT_BLOCKS;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* left: source + crops */}
      <div className="space-y-4">
        <div className="card p-4">
          <div className="mb-3 text-sm font-bold text-slate-900">Source bill</div>
          {imageUrl && <img src={imageUrl} alt="source bill" className="max-h-80 w-full rounded-lg object-contain" />}
        </div>

        <div className="card p-4">
          <div className="mb-3 text-sm font-bold text-slate-900">Logo & signature (found on your bill)</div>
          <p className="mb-3 text-xs text-slate-500">
            AI cropped these from the photo. Keep them, replace with a cleaner scan, or remove — blurry crops are
            normal for carbon-copy books, so replacing is recommended when available.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <AssetSlot
              label="Logo"
              icon={ImageIcon}
              assetId={logoAssetId}
              enabled={flags.hasLogo}
              onToggle={(on) => setAnalysis({ ...analysis!, flags: { ...flags, hasLogo: on } })}
              onRemove={() => setLogoAssetId(null)}
              onReplace={() => logoReplaceRef.current?.click()}
            />
            <AssetSlot
              label="Signature"
              icon={PenTool}
              assetId={signatureAssetId}
              enabled={flags.hasSignature}
              onToggle={(on) => setAnalysis({ ...analysis!, flags: { ...flags, hasSignature: on } })}
              onRemove={() => setSignatureAssetId(null)}
              onReplace={() => sigReplaceRef.current?.click()}
            />
          </div>
          <input
            ref={logoReplaceRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && replaceAsset("logo", e.target.files[0])}
          />
          <input
            ref={sigReplaceRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && replaceAsset("signature", e.target.files[0])}
          />
        </div>

        <div className="card p-4">
          <div className="mb-2 text-sm font-bold text-slate-900">Page size</div>
          <div className="flex gap-2">
            {(["A5", "A4"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setPageFormat(f)}
                className={`btn flex-1 ${pageFormat === f ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
              >
                {f} {f === "A5" ? "(bill book)" : "(full page)"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* right: detected details */}
      <div className="space-y-4">
        {analysis?.mock && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Demo mode — showing placeholder data. Add a Gemini key in Settings to read the real bill.
          </div>
        )}
        <div className="card p-4">
          <div className="mb-3 text-sm font-bold text-slate-900">Detected business details</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Business name</label>
              <input
                className="field"
                value={analysis?.businessName || ""}
                onChange={(e) => setAnalysis({ ...analysis!, businessName: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Tagline / Specialist in</label>
              <input
                className="field"
                value={analysis?.tagline || ""}
                onChange={(e) => setAnalysis({ ...analysis!, tagline: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input
                className="field"
                value={analysis?.address || ""}
                onChange={(e) => setAnalysis({ ...analysis!, address: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="field"
                value={analysis?.phone || ""}
                onChange={(e) => setAnalysis({ ...analysis!, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input
                className="field"
                value={analysis?.gstin || ""}
                onChange={(e) => setAnalysis({ ...analysis!, gstin: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-3 text-sm font-bold text-slate-900">Sections on this bill</div>
          <div className="flex flex-wrap gap-2">
            {FLAG_LABELS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAnalysis({ ...analysis!, flags: { ...flags, [key]: !flags[key] } })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  flags[key]
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {flags[key] ? "✓ " : "+ "}
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Tap to include or exclude a section — e.g. if this bill has no logo, switch Logo off.
          </p>
        </div>

        {(analysis?.fields?.length || 0) > 0 && (
          <div className="card p-4">
            <div className="mb-3 text-sm font-bold text-slate-900">Extra fields on this bill</div>
            <div className="space-y-2">
              {analysis!.fields.map((f, i) => (
                <div key={f.key} className="flex items-center gap-2">
                  <input
                    className="field"
                    value={f.label}
                    onChange={(e) => {
                      const fields = [...analysis!.fields];
                      fields[i] = { ...f, label: e.target.value };
                      setAnalysis({ ...analysis!, fields });
                    }}
                  />
                  <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">{f.type}</span>
                  <button
                    className="btn-ghost !px-2 text-red-500"
                    onClick={() => setAnalysis({ ...analysis!, fields: analysis!.fields.filter((x) => x.key !== f.key) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="card p-4">
          <label className="label">Template name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={generate} disabled={generating || !name.trim()} className="btn-primary mt-4 w-full py-2.5">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Building your template…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> Generate reusable template
              </>
            )}
          </button>
          <button onClick={reset} className="btn-ghost mt-2 w-full">
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetSlot({
  label,
  icon: Icon,
  assetId,
  enabled,
  onToggle,
  onRemove,
  onReplace,
}: {
  label: string;
  icon: React.ElementType;
  assetId: string | null;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  return (
    <div className={`rounded-xl border p-3 ${enabled ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <button
          onClick={() => onToggle(!enabled)}
          className={`h-4 w-7 rounded-full transition ${enabled ? "bg-indigo-600" : "bg-slate-300"}`}
        >
          <span className={`block h-3 w-3 rounded-full bg-white transition ${enabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
        </button>
      </div>
      <div className="flex h-20 items-center justify-center rounded-lg bg-slate-50">
        {enabled && assetId ? (
          <img src={`/api/assets/${assetId}`} alt={label} className="max-h-20 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400">{enabled ? (assetId ? "" : "No crop found — replace") : "Switched off"}</span>
        )}
      </div>
      <div className="mt-2 flex justify-center gap-2">
        <button onClick={onReplace} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
          Upload clean image
        </button>
        {assetId && (
          <button onClick={onRemove} className="rounded border border-red-100 px-2 py-1 text-[10px] font-semibold text-red-500 hover:bg-red-50">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Import flow ------------------------------- */

function ImportFlow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/templates/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      router.push(`/templates/${data.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <label className="card block cursor-pointer p-10 text-center transition hover:border-emerald-300 hover:shadow-md">
        <input
          type="file"
          accept=".html,.htm,.docx,.pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        {busy ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-500" />
            <div className="mt-4 font-bold text-slate-900">Importing…</div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <FileUp className="h-6 w-6" />
            </div>
            <div className="mt-4 font-bold text-slate-900">Upload .html, .docx or .pdf</div>
            <div className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              HTML imports directly. Word (.docx) is converted automatically. PDF goes through the AI Bill Maker
              (needs a Gemini key).
            </div>
          </>
        )}
      </label>
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div className="card mt-4 p-4 text-xs leading-relaxed text-slate-500">
        <b className="text-slate-700">Tip:</b> after import, open the template editor and replace fixed text (bill
        number, client name…) with placeholders like <code className="rounded bg-slate-100 px-1">{`{{billNo}}`}</code> and{" "}
        <code className="rounded bg-slate-100 px-1">{`{{client.name}}`}</code> so each bill fills them automatically. A cheat-sheet
        of every placeholder is right inside the editor.
      </div>
    </div>
  );
}

/* ------------------------------ Built-in gallery ----------------------------- */

function BuiltinGallery({ builtins }: { builtins: BuiltinCard[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [zoom, setZoom] = useState<BuiltinCard | null>(null);

  async function use(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/templates/from-builtin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ builtinId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/templates/${data.id}/edit`);
    } catch {
      alert("Could not create template");
      setBusyId("");
    }
  }

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        {builtins.map((b) => (
          <div key={b.id} className="card flex flex-col overflow-hidden">
            <div className="relative h-64 overflow-hidden border-b border-slate-100 bg-slate-100">
              <iframe
                title={b.id}
                srcDoc={b.previewHtml}
                sandbox=""
                className="pointer-events-none absolute left-1/2 top-2 origin-top-left -translate-x-1/2 border-0 bg-white shadow-md"
                style={{ width: "210mm", height: "297mm", transform: "translateX(-50%) scale(0.52)" }}
              />
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-900">{b.name}</div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{b.pageFormat}</span>
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-500">{b.description}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => use(b.id)} disabled={busyId === b.id} className="btn-primary flex-1 !py-1.5 text-xs">
                  {busyId === b.id ? "Adding…" : "Use this template"}
                </button>
                <button onClick={() => setZoom(b)} className="btn-secondary !py-1.5 text-xs">
                  Full preview
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setZoom(null)}>
          <div className="relative h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl bg-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
              <span className="text-sm font-bold text-slate-800">{zoom.name} — sample preview</span>
              <button onClick={() => setZoom(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                ✕
              </button>
            </div>
            <iframe title="zoom" srcDoc={zoom.previewHtml} sandbox="" className="h-[calc(92vh-45px)] w-full bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
