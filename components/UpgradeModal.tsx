"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, X, ShieldCheck, Zap, HardDrive, Ban, Loader2 } from "lucide-react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: "free" | "pro";
  onSuccess?: () => void;
}

export default function UpgradeModal({
  isOpen,
  onClose,
  currentPlan = "free",
  onSuccess,
}: UpgradeModalProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handlePlanSwitch(plan: "free" | "pro") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Subscription update failed");
      if (onSuccess) onSuccess();
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-indigo-600">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider">BillFlow Premium</span>
        </div>

        <h2 className="mt-3 text-2xl font-black text-slate-900">
          Upgrade to Pro Business
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Supercharge your billing with unlimited bills, unlimited AI templates, and zero ads.
        </p>

        <div className="mt-5 rounded-xl border-2 border-indigo-500 bg-indigo-50/40 p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-black text-slate-900">$5</span>
              <span className="text-sm font-semibold text-slate-500"> / month</span>
            </div>
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              Most Popular
            </span>
          </div>

          <div className="mt-4 space-y-2.5 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span><strong>Unlimited</strong> Bills (vs 50 Bills Free Limit)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span><strong>Unlimited</strong> AI Template Generations (vs 5 Free)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span><strong>100% Ad-Free</strong> on Website & Mobile App</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Instant PDF export & print</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Multi-device real-time sync</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {currentPlan === "free" ? (
            <button
              onClick={() => handlePlanSwitch("pro")}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Upgrade to Pro for $5/mo
            </button>
          ) : (
            <button
              onClick={() => handlePlanSwitch("free")}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Switch back to Freemium plan
            </button>
          )}

          <div className="flex items-center justify-center gap-2 text-center text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Cancel anytime • Instant activation
          </div>
        </div>
      </div>
    </div>
  );
}
