"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Building2,
  Wallet,
  KeyRound,
  Shield,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Zap,
  HardDrive,
  Ban,
  Crown,
} from "lucide-react";

interface SettingsInitial {
  name: string;
  email: string;
  businessName: string;
  businessTagline: string;
  businessAddress: string;
  businessPhone: string;
  businessGstin: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankUpiId: string;
}

import { formatBytes, type UserUsageInfo } from "@/lib/quotas-client";
import UpgradeModal from "./UpgradeModal";

export default function SettingsForm({
  initial,
  authInfo,
  usage,
}: {
  initial: SettingsInitial;
  authInfo?: { hasPassword?: boolean; isGoogleLinked?: boolean };
  usage?: UserUsageInfo;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Security state
  const [hasPassword, setHasPassword] = useState(authInfo?.hasPassword ?? false);
  const [isGoogleLinked, setIsGoogleLinked] = useState(authInfo?.isGoogleLinked ?? false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Delete profile state
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [showDeleteConfirmStep, setShowDeleteConfirmStep] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function set(key: keyof SettingsInitial) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          businessTagline: form.businessTagline,
          businessAddress: form.businessAddress,
          businessPhone: form.businessPhone,
          businessGstin: form.businessGstin,
          bankName: form.bankName,
          bankAccountNo: form.bankAccountNo,
          bankIfsc: form.bankIfsc,
          bankUpiId: form.bankUpiId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Save failed");
      } else {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError("New password and confirmation do not match.");
      return;
    }

    setPwBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update password");
      }

      setPwSuccess(data.message || "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password update failed.");
    } finally {
      setPwBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmationInput.trim() !== "DELETE") {
      setDeleteError("Please type DELETE to confirm permanent deletion.");
      return;
    }

    setDeleteBusy(true);
    setDeleteError("");

    try {
      const res = await fetch("/api/auth/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      window.location.href = "/login?deleted=true";
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Deletion failed");
      setDeleteBusy(false);
    }
  }

  const isPro = usage?.isPro ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          These details auto-fill on every bill. Signed in as {form.name} ({form.email}).
        </p>
      </div>

      {/* Plan & Subscription Card */}
      <div className="card p-6 border-indigo-100 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/20">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isPro ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
            }`}>
              {isPro ? <Crown className="h-5 w-5 fill-amber-500 text-amber-700" /> : <Zap className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {isPro ? "Pro Business Plan" : "Freemium Plan"}
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isPro ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                }`}>
                  {isPro ? "$5 / month" : "Free Forever"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isPro
                  ? "Unlimited bills, unlimited AI templates, and zero ads."
                  : "50 bills limit, 5 AI templates. Ads enabled."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowUpgradeModal(true)}
            className={`btn ${
              isPro
                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs"
                : "btn-primary text-xs shadow-md shadow-indigo-200"
            }`}
          >
            {isPro ? "Manage plan" : "Upgrade to Pro ($5/mo)"}
          </button>
        </div>

        {usage && (
          <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-slate-500">Cloud bills</div>
              <div className="mt-1 text-base font-bold text-slate-900">
                {usage.billsCount} <span className="text-xs font-normal text-slate-400">/ {isPro ? "∞" : "50 max"}</span>
              </div>
              {!isPro && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${usage.billsCount >= 45 ? "bg-red-500" : "bg-indigo-600"}`}
                    style={{ width: `${Math.min(100, (usage.billsCount / 50) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-slate-500">AI template generations</div>
              <div className="mt-1 text-base font-bold text-slate-900">
                {usage.aiGenerationsUsed}{" "}
                <span className="text-xs font-normal text-slate-400">/ {isPro ? "∞" : "5 max"}</span>
              </div>
              {!isPro && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${usage.aiGenerationsUsed >= 5 ? "bg-red-500" : "bg-purple-600"}`}
                    style={{ width: `${Math.min(100, (usage.aiGenerationsUsed / 5) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Business profile */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Building2 className="h-4 w-4 text-indigo-500" /> Business profile (printed as seller on bills)
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Business name</label>
            <input className="field" value={form.businessName} onChange={set("businessName")} placeholder="Sharma Engineering Works" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Tagline / &quot;Specialist in&quot; line</label>
            <input className="field" value={form.businessTagline} onChange={set("businessTagline")} placeholder="SHAPING, MILLING, TURNING & FITTING WORKS" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <textarea rows={2} className="field" value={form.businessAddress} onChange={set("businessAddress")} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="field" value={form.businessPhone} onChange={set("businessPhone")} />
          </div>
          <div>
            <label className="label">Your GSTIN</label>
            <input className="field" value={form.businessGstin} onChange={set("businessGstin")} />
          </div>
        </div>
      </div>

      {/* Bank */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Wallet className="h-4 w-4 text-indigo-500" /> Bank details (for the optional bank block)
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Bank name & branch</label>
            <input className="field" value={form.bankName} onChange={set("bankName")} />
          </div>
          <div>
            <label className="label">Account number</label>
            <input className="field" value={form.bankAccountNo} onChange={set("bankAccountNo")} />
          </div>
          <div>
            <label className="label">IFSC code</label>
            <input className="field" value={form.bankIfsc} onChange={set("bankIfsc")} />
          </div>
          <div>
            <label className="label">UPI ID</label>
            <input className="field" value={form.bankUpiId} onChange={set("bankUpiId")} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
        </button>
        {saved && <span className="text-sm font-semibold text-emerald-600">Saved ✓</span>}
      </div>

      {/* Security & Login Methods */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Shield className="h-4 w-4 text-indigo-500" /> Account Security & Login Methods
        </div>

        {/* Google Account */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 mb-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-2xs">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Google Sign-In</h3>
                <p className="text-xs text-slate-500">
                  {isGoogleLinked
                    ? "Your Google account is connected. You can log in with 1-click Google Sign-In."
                    : "Connect your Google account to enable 1-click Google Sign-In."}
                </p>
              </div>
            </div>

            {isGoogleLinked ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => (window.location.href = "/api/auth/google?link=true")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition shrink-0"
              >
                <span>Connect Google Account</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {/* Password Form */}
        <div className="border-t border-slate-200 pt-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <KeyRound className="h-4 w-4 text-indigo-600" />
            {hasPassword ? "Change Password" : "Set Account Password"}
          </div>

          {!hasPassword && (
            <div className="mb-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
              You originally signed in with Google. Set a password below so you can also log in using your email and password.
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
            {hasPassword && (
              <div>
                <label className="label">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="field pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="label">New Password (min 6 characters)</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="field pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="field pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {pwError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
                {pwError}
              </div>
            )}

            {pwSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-700">
                {pwSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={pwBusy}
              className="btn-primary text-xs font-bold"
            >
              {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {hasPassword ? "Update Password" : "Set Password"}
            </button>
          </form>
        </div>
      </div>

      {/* Danger Zone: Delete Profile & All Data */}
      <div className="card p-6 border-red-200 bg-red-50/30">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-red-900">
          <Trash2 className="h-4 w-4 text-red-600" /> Danger Zone: Delete Profile & All Data
        </div>
        <p className="text-xs text-red-700">
          Permanently delete your profile, business settings, all invoices, clients, custom templates, and uploaded logo/signature files. This action cannot be reversed.
        </p>

        {!showDeleteConfirmStep ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowDeleteConfirmStep(true)}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition cursor-pointer"
            >
              Delete profile & data...
            </button>
          </div>
        ) : (
          <div className="mt-4 max-w-md space-y-3 rounded-xl border border-red-300 bg-white p-4">
            <p className="text-xs font-bold text-slate-800">
              Type <span className="font-mono text-red-600 font-black">DELETE</span> to confirm permanent deletion:
            </p>
            <input
              type="text"
              value={deleteConfirmationInput}
              onChange={(e) => setDeleteConfirmationInput(e.target.value)}
              placeholder="Type DELETE"
              className="field font-mono text-sm border-red-300 focus:border-red-500 focus:ring-red-500"
            />

            {deleteError && (
              <div className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-600">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmationInput.trim() !== "DELETE" || deleteBusy}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 disabled:opacity-40 transition cursor-pointer"
              >
                {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Permanently Delete Everything
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirmStep(false);
                  setDeleteConfirmationInput("");
                  setDeleteError("");
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={usage?.plan}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
