"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import GoogleSignInButton from "@/components/GoogleSignInButton";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) setError(err);
    if (searchParams.get("deleted") === "true") {
      setNotice("Your profile and all associated data have been permanently deleted.");
    }
  }, [searchParams]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.push(data.onboardingDone ? "/dashboard" : "/welcome");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
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
        <div className="card p-8">
          <h1 className="text-xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Log in to manage your bills.</p>

          {notice && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              {notice}
            </div>
          )}

          <div className="mt-6">
            <GoogleSignInButton label="Continue with Google" />

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2.5 text-slate-400 font-semibold tracking-wider">
                  Or with email
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="field"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                className="field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 cursor-pointer">
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New to BillFlow?{" "}
            <Link href="/signup" className="font-semibold text-indigo-600 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
