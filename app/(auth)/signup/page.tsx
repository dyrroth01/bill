"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { Mail, ArrowLeft, RefreshCw, KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Step state: "FORM" | "VERIFY"
  const [step, setStep] = useState<"FORM" | "VERIFY">("FORM");
  const [form, setForm] = useState({ name: "", businessName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Verification step state
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) setError(err);
  }, [searchParams]);

  // Resend cooldown timer
  useEffect(() => {
    if (step !== "VERIFY" || resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, resendCooldown]);

  function setFormField(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  }

  // Submit initial signup form to trigger 6-digit OTP
  async function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      if (data.requiresVerification) {
        setDevCode(data.devCode || null);
        setStep("VERIFY");
        setResendCooldown(30);
        // Focus first digit box
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      } else {
        router.push("/welcome");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  // Handle individual digit input
  function handleDigitChange(index: number, val: string) {
    const cleaned = val.replace(/\D/g, "");
    if (!cleaned) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // Single digit input
    const next = [...digits];
    next[index] = cleaned[cleaned.length - 1];
    setDigits(next);

    // Auto-advance to next input
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  // Handle backspace navigation
  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  // Handle pasting full 6-digit code
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);

    const nextIndex = Math.min(5, pasted.length);
    inputRefs.current[nextIndex]?.focus();

    if (pasted.length === 6) {
      verifyCode(pasted);
    }
  }

  // Auto-fill dev code in local demo mode
  function autoFillDevCode() {
    if (!devCode || devCode.length !== 6) return;
    const split = devCode.split("");
    setDigits(split);
    verifyCode(devCode);
  }

  // Verify code with backend
  async function verifyCode(codeToVerify?: string) {
    const code = codeToVerify || digits.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits of the verification code.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      router.push(data.onboardingDone ? "/dashboard" : "/welcome");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setBusy(false);
    }
  }

  // Resend fresh 6-digit code
  async function handleResendCode() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError("");
    setResendSuccess(false);
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend code");

      setDevCode(data.devCode || null);
      setResendCooldown(30);
      setResendSuccess(true);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50/60 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <span className="text-lg font-bold">B</span>
            </div>
            <span className="text-xl font-bold text-slate-900">BillFlow</span>
          </Link>
        </div>

        <div className="card p-8 shadow-xl border border-slate-200/80">
          {step === "FORM" ? (
            /* --------------------------- STEP 1: SIGNUP FORM --------------------------- */
            <>
              <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
              <p className="mt-1 text-sm text-slate-500">
                Free. Your starter bill templates will be ready right after signup.
              </p>

              <div className="mt-6">
                <GoogleSignInButton label="Sign up with Google" />

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2.5 text-slate-400 font-semibold tracking-wider">
                      Or register with email
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleInitialSubmit} className="space-y-4">
                <div>
                  <label className="label">Your name *</label>
                  <input
                    required
                    className="field"
                    placeholder="Nikhil Sharma"
                    value={form.name}
                    onChange={setFormField("name")}
                  />
                </div>
                <div>
                  <label className="label">Business name</label>
                  <input
                    className="field"
                    placeholder="Sharma Engineering Works"
                    value={form.businessName}
                    onChange={setFormField("businessName")}
                  />
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input
                    type="email"
                    required
                    className="field"
                    placeholder="you@business.com"
                    value={form.email}
                    onChange={setFormField("email")}
                  />
                </div>
                <div>
                  <label className="label">Password * (min 6 characters)</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="field"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={setFormField("password")}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 cursor-pointer">
                  {busy ? "Sending verification code…" : "Continue & verify email →"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
                  Log in
                </Link>
              </p>
            </>
          ) : (
            /* -------------------- STEP 2: 6-DIGIT CODE VERIFICATION -------------------- */
            <>
              <button
                type="button"
                onClick={() => {
                  setStep("FORM");
                  setError("");
                }}
                className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to edit details
              </button>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
                <Mail className="h-6 w-6" />
              </div>

              <h1 className="text-xl font-bold text-slate-900">Check your email</h1>
              <p className="mt-1 text-sm text-slate-600">
                We sent a 6-digit verification code to:
                <br />
                <strong className="text-slate-900 font-semibold">{form.email}</strong>
              </p>

              {/* Developer / Demo Mode Auto-Fill Badge */}
              {devCode && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5" /> Demo Code: <code className="font-mono text-sm font-bold">{devCode}</code>
                    </span>
                    <button
                      type="button"
                      onClick={autoFillDevCode}
                      className="rounded-md bg-amber-200/80 hover:bg-amber-200 px-2 py-1 font-bold text-amber-900 transition"
                    >
                      Auto-fill &rarr;
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-amber-700">
                    (Logged to terminal. Add RESEND_API_KEY to .env for real email delivery)
                  </p>
                </div>
              )}

              {/* 6 Digit Input Boxes */}
              <div className="mt-6">
                <label className="label mb-2 block text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                  Enter 6-digit code
                </label>
                <div className="flex justify-between gap-2">
                  {digits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        inputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={idx === 0 ? handlePaste : undefined}
                      className="h-12 w-12 rounded-xl border-2 border-slate-200 text-center text-xl font-black text-slate-900 shadow-xs transition focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {resendSuccess && (
                <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>A fresh verification code has been dispatched!</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => verifyCode()}
                disabled={busy || digits.some((d) => !d)}
                className="btn-primary mt-6 w-full py-2.5 cursor-pointer disabled:opacity-50"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                  </span>
                ) : (
                  "Verify email & enter dashboard"
                )}
              </button>

              {/* Resend Code Section */}
              <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                Didn&apos;t receive the code?{" "}
                {resendCooldown > 0 ? (
                  <span className="font-semibold text-slate-400">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resending}
                    className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                  >
                    {resending ? "Sending…" : "Resend code"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <SignupForm />
    </Suspense>
  );
}
