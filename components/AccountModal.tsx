"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Shield,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Crown,
  Zap,
} from "lucide-react";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    name: string;
    email: string;
    businessName?: string | null;
    plan?: "free" | "pro";
    hasPassword?: boolean;
    googleId?: string | null;
    avatarUrl?: string | null;
  };
}

export default function AccountModal({ isOpen, onClose, user: initialUser }: AccountModalProps) {
  const router = useRouter();

  // Profile status state
  const [profile, setProfile] = useState(initialUser);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Tabs: "security" (Google & Password) | "danger" (Delete Account)
  const [activeTab, setActiveTab] = useState<"security" | "danger">("security");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Delete account state
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [showDeleteConfirmStep, setShowDeleteConfirmStep] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Fetch latest security info when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Reset form states when closed
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwError("");
      setPwSuccess("");
      setDeleteConfirmationInput("");
      setShowDeleteConfirmStep(false);
      setDeleteError("");
      return;
    }

    setLoadingProfile(true);
    fetch("/api/auth/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setProfile((prev) => ({
            ...prev,
            hasPassword: data.user.hasPassword,
            googleId: data.user.isGoogleLinked ? "linked" : null,
            avatarUrl: data.user.avatarUrl,
          }));
        }
      })
      .catch((err) => console.error("Error fetching profile:", err))
      .finally(() => setLoadingProfile(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const isGoogleLinked = Boolean(profile.googleId);
  const hasPassword = Boolean(profile.hasPassword);
  const isPro = profile.plan === "pro";

  // Connect Google Account
  function handleConnectGoogle() {
    window.location.href = "/api/auth/google?link=true";
  }

  // Handle password submit
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
      setProfile((p) => ({ ...p, hasPassword: true }));
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password update failed.");
    } finally {
      setPwBusy(false);
    }
  }

  // Handle permanent account & data deletion
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

      // Redirect to login with deleted notification
      window.location.href = "/login?deleted=true";
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Deletion failed");
      setDeleteBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header with User Info */}
        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm sm:text-base font-bold text-white shadow-sm">
              {profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm sm:text-base font-bold text-slate-900">{profile.name}</h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    isPro ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {isPro ? <Crown className="h-3 w-3 fill-amber-500 text-amber-700" /> : <Zap className="h-3 w-3" />}
                  {isPro ? "Pro" : "Free"}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{profile.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition shrink-0 ml-2"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/50 px-3 sm:px-5 pt-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={`flex items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition ${
              activeTab === "security"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Security & Login
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("danger")}
            className={`flex items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition ${
              activeTab === "danger"
                ? "border-red-600 text-red-600"
                : "border-transparent text-slate-500 hover:text-red-600"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Delete Profile & Data
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {activeTab === "security" && (
            <>
              {/* Google Sign-In Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
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
                          ? "Your Google account is connected for 1-click login."
                          : "Save your account with Google for quick 1-click sign in."}
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
                      onClick={handleConnectGoogle}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 transition shrink-0"
                    >
                      <span>Connect Google</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Password Section */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <KeyRound className="h-4 w-4 text-indigo-600" />
                  {hasPassword ? "Change Password" : "Set Account Password"}
                </div>

                {!hasPassword && (
                  <div className="mb-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                    You currently sign in via Google. Set a password below so you can also log in using your email and password.
                  </div>
                )}

                <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
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

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={pwBusy}
                      className="btn-primary flex items-center justify-center gap-2 text-xs font-bold px-4 py-2.5"
                    >
                      {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {hasPassword ? "Update Password" : "Set Password"}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {activeTab === "danger" && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-red-900">Delete Profile & All Data</h3>
                  <p className="mt-1 text-xs text-red-700 leading-relaxed">
                    This action is <strong>irreversible</strong> and will permanently wipe your account and all associated records:
                  </p>
                  <ul className="mt-2 list-disc list-inside text-xs text-red-700 space-y-1">
                    <li>Your profile, business settings, and login credentials</li>
                    <li>All invoices and billing records</li>
                    <li>All saved client entries and contact info</li>
                    <li>All custom bill templates</li>
                    <li>All uploaded logos, signatures, and document files</li>
                  </ul>
                </div>
              </div>

              {!showDeleteConfirmStep ? (
                <div className="mt-6 pt-4 border-t border-red-200">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmStep(true)}
                    className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                    I want to delete my profile & data
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-3 rounded-xl border border-red-300 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-slate-800">
                    To confirm permanent deletion, please type <span className="font-mono text-red-600 font-black">DELETE</span> below:
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

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmationInput.trim() !== "DELETE" || deleteBusy}
                      className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-40 transition cursor-pointer"
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
          )}
        </div>
      </div>
    </div>
  );
}
