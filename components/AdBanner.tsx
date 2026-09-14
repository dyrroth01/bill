"use client";

import { useState } from "react";
import { Sparkles, ExternalLink, ShieldCheck, X } from "lucide-react";
import UpgradeModal from "./UpgradeModal";

interface AdBannerProps {
  variant?: "sidebar" | "banner" | "card";
  className?: string;
  showAds?: boolean;
}

export default function AdBanner({
  variant = "banner",
  className = "",
  showAds = true,
}: AdBannerProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [closed, setClosed] = useState(false);

  if (!showAds || closed) return null;

  if (variant === "sidebar") {
    return (
      <>
        <div
          className={`relative mt-3 rounded-xl border border-slate-200 bg-gradient-to-br from-indigo-50/70 via-slate-50 to-purple-50/40 p-3 shadow-xs ${className}`}
        >
          <div className="flex items-center justify-between">
            <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Sponsored
            </span>
            <button
              onClick={() => setShowUpgrade(true)}
              className="text-[10px] font-semibold text-indigo-600 hover:underline"
            >
              Remove Ads
            </button>
          </div>

          <div className="mt-2 text-xs font-bold text-slate-800">
            Automate your GST & Payments
          </div>
          <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
            Accept UPI & Card payments instantly with lower transaction fees.
          </p>

          <button
            onClick={() => setShowUpgrade(true)}
            className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-indigo-700"
          >
            <Sparkles className="h-3 w-3" /> Upgrade to Pro ($5/mo)
          </button>
        </div>

        <UpgradeModal
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          currentPlan="free"
        />
      </>
    );
  }

  return (
    <>
      <div
        className={`relative flex flex-col items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-pink-50/40 px-4 py-3 sm:flex-row ${className}`}
      >
        <div className="flex items-center gap-3">
          <span className="rounded bg-indigo-200/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800">
            Ad
          </span>
          <div>
            <div className="text-xs font-bold text-slate-900">
              Cloud Backup & Unlimited GST Billing • Pro Business Plan
            </div>
            <div className="text-[11px] text-slate-600">
              Free accounts are limited to 50 bills and 500MB storage. Get 10GB cloud storage & 0 ads for $5/mo.
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowUpgrade(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <Sparkles className="h-3.5 w-3.5" /> Remove Ads ($5/mo)
          </button>
          <button
            onClick={() => setClosed(true)}
            className="rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600"
            title="Dismiss ad"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentPlan="free"
      />
    </>
  );
}
