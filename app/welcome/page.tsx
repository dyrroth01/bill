"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, FileUp, LayoutTemplate, ArrowRight, Building2 } from "lucide-react";

export default function WelcomePage() {
  const router = useRouter();

  // new users land here after signup; mark onboarding started
  useEffect(() => {
    fetch("/api/auth/me", { method: "POST" }).catch(() => {});
  }, []);

  async function goDashboard() {
    router.push("/dashboard");
  }

  const cards = [
    {
      icon: Sparkles,
      title: "AI Bill Maker",
      highlight: "Recommended",
      desc: "Take a photo of your existing bill-book page (or upload a PDF). AI reads the letterhead — logo, GSTIN, table, signature — and recreates it as a reusable digital template.",
      href: "/templates/new?tab=ai",
      cta: "Create from a bill photo",
      accent: "bg-indigo-600",
    },
    {
      icon: FileUp,
      title: "Import template",
      desc: "Already have a bill in Word (.docx) or HTML? Upload the file and keep billing in your own format.",
      href: "/templates/new?tab=import",
      cta: "Upload a file",
      accent: "bg-emerald-600",
    },
    {
      icon: LayoutTemplate,
      title: "Ready-made templates",
      desc: "Start instantly from professionally designed formats — classic bill-book, GST tax invoice or a modern A4 invoice. Edit anything later.",
      href: "/templates/new?tab=builtin",
      cta: "Browse templates",
      accent: "bg-amber-500",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-indigo-50/40 to-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm border border-indigo-100">
            Welcome to BillFlow 👋
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Let&apos;s set up your first bill format</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            You only do this once per bill format. After that, every bill is a 30-second form that produces a
            pixel-perfect PDF.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.title}
              className="card relative flex flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {c.highlight && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {c.highlight}
                </span>
              )}
              <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${c.accent} text-white`}>
                <c.icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900">{c.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{c.desc}</p>
              <Link href={c.href} className="btn-secondary mt-5 justify-center">
                {c.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Set up your business profile</div>
              <div className="text-xs text-slate-500">
                Business name, address, GSTIN and bank details get auto-filled on every bill.
              </div>
            </div>
          </div>
          <Link href="/settings" className="btn-secondary whitespace-nowrap">
            Open settings
          </Link>
        </div>

        <div className="mt-8 text-center">
          <button onClick={goDashboard} className="text-sm font-semibold text-indigo-600 hover:underline">
            Skip for now — take me to the dashboard →
          </button>
        </div>
      </div>
    </main>
  );
}
