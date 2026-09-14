import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  Sparkles,
  FileUp,
  LayoutDashboard,
  FileText,
  BadgeIndianRupee,
  BellRing,
  ArrowRight,
  Check,
  Zap,
} from "lucide-react";

export default async function Landing() {
  const user = await getSessionUser();
  if (user) redirect(user.onboardingDone ? "/dashboard" : "/welcome");

  const features = [
    {
      icon: Sparkles,
      title: "AI Bill Maker",
      desc: "Photograph your existing bill-book page. AI reads the letterhead — logo, GSTIN, table, signature — and recreates it as a reusable digital template.",
    },
    {
      icon: FileUp,
      title: "Import your template",
      desc: "Already have a bill in Word (.docx) or HTML? Upload it and keep billing in your own format.",
    },
    {
      icon: FileText,
      title: "Pixel-perfect PDFs",
      desc: "Every bill is rendered to a clean PDF that looks exactly like your printed bill book — ready to WhatsApp, email or print.",
    },
    {
      icon: LayoutDashboard,
      title: "CRM dashboard",
      desc: "See total billed, collected, pending and overdue at a glance, with monthly trends and client-wise tracking.",
    },
    {
      icon: BellRing,
      title: "Overdue alerts",
      desc: "Bills cross their due date and automatically show up as overdue. Never lose track of a payment again.",
    },
    {
      icon: BadgeIndianRupee,
      title: "Cheque tracking",
      desc: "Record cheque payments with number and status — pending, cleared or bounced — right on the bill.",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-indigo-50/40 to-slate-50">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-slate-900">BillFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary">
            Sign up free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 text-center">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
          Turn your paper bill book into digital PDFs
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
          Create digital bills in minutes.
          <br />
          <span className="text-indigo-600">Get paid on time.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          BillFlow recreates your existing bill format with AI, generates professional PDF bills, and tracks
          paid, pending and overdue payments in one simple dashboard — built for small businesses.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">
            Create your first bill <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">
            I already have an account
          </Link>
        </div>

        {/* Sample bill mock strip */}
        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-4 text-left sm:grid-cols-4">
          {[
            ["1", "Sign up", "Free account, no card needed"],
            ["2", "Pick your format", "AI from a photo, import, or ready template"],
            ["3", "Create bills", "Fill a simple form, get a PDF"],
            ["4", "Track payments", "Paid / pending / overdue dashboard"],
          ].map(([n, t, d]) => (
            <div key={n} className="card p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                {n}
              </div>
              <div className="text-sm font-bold text-slate-900">{t}</div>
              <div className="mt-1 text-xs text-slate-500">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-slate-900">Everything your billing needs</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Some bills have a logo, some don&apos;t. Some need GST columns, cheque details or a signature —
            BillFlow templates handle all of it with optional blocks.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="card p-6 transition hover:shadow-md">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <f.icon className="h-5.5 w-5.5" />
                </div>
                <div className="text-base font-bold text-slate-900">{f.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="border-t border-slate-200 bg-slate-50/50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              Simple, Transparent Pricing
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-slate-900">Choose the plan that fits your business</h2>
            <p className="mt-2 text-slate-600">Start free with up to 50 bills, upgrade whenever you need unlimited bills and zero ads.</p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-2">
            {/* Free Tier */}
            <div className="card relative flex flex-col p-8 bg-white">
              <div className="text-sm font-bold uppercase tracking-wider text-slate-500">Freemium</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-black text-slate-900">$0</span>
                <span className="text-slate-500 font-medium">/ month forever</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Perfect for micro-businesses, solo vendors, and testing your bill format.
              </p>

              <div className="my-6 border-t border-slate-100" />

              <div className="flex-1 space-y-3 text-sm text-slate-700">
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                  <span><strong>50 bills limit</strong> included for free</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                  <span><strong>5 AI template generations</strong> from bill photos</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                  <span>Instant PDF export & print</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                  <span>Client & payment tracking</span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-400">
                  <span className="text-xs">Includes light advertisements</span>
                </div>
              </div>

              <Link href="/signup" className="btn-secondary mt-8 justify-center py-2.5">
                Get started free
              </Link>
            </div>

            {/* Pro Tier */}
            <div className="card relative flex flex-col p-8 border-2 border-indigo-600 bg-gradient-to-b from-white to-indigo-50/20 shadow-xl">
              <div className="absolute -top-3 right-6 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                Best value
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider text-indigo-600">Pro Business</span>
                <Zap className="h-4 w-4 fill-indigo-600 text-indigo-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-black text-slate-900">$5</span>
                <span className="text-slate-500 font-medium">/ month</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                For established businesses needing unlimited bills, unlimited AI templates, and ad-free experience.
              </p>

              <div className="my-6 border-t border-indigo-100" />

              <div className="flex-1 space-y-3 text-sm text-slate-700">
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span><strong>Unlimited bills</strong> creation & sync</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span><strong>Unlimited</strong> AI template generations</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span><strong>100% Ad-Free</strong> on website & mobile app</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Multi-device real-time sync</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Priority support & updates</span>
                </div>
              </div>

              <Link href="/signup" className="btn-primary mt-8 justify-center py-2.5 shadow-md shadow-indigo-200">
                <Zap className="h-4 w-4" /> Start Pro ($5/month)
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        BillFlow — digital billing for small business. Your data stays securely in PostgreSQL.
      </footer>
    </main>
  );
}
