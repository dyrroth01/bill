"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileText, LayoutTemplate, Users, Settings, LogOut, Menu, X, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import AdBanner from "./AdBanner";
import UpgradeModal from "./UpgradeModal";
import AccountModal from "./AccountModal";
import type { UserUsageInfo } from "@/lib/quotas-client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bills", label: "Bills", icon: FileText },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({
  user,
  usage,
}: {
  user: {
    name: string;
    email: string;
    businessName?: string | null;
    plan?: "free" | "pro";
    hasPassword?: boolean;
    googleId?: string | null;
    avatarUrl?: string | null;
  };
  usage?: UserUsageInfo;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  const isPro = user.plan === "pro";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const quotaWidget = usage && (
    <div className="mt-auto border-t border-slate-100 pt-3 text-xs">
      <div className="flex items-center justify-between font-bold">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
          isPro ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"
        }`}>
          {isPro ? <Zap className="h-3 w-3 text-amber-600 fill-amber-500" /> : null}
          {isPro ? "Pro Plan ($5/mo)" : "Freemium"}
        </span>
        {!isPro && (
          <button
            onClick={() => {
              setOpen(false);
              setShowUpgradeModal(true);
            }}
            className="text-[11px] font-bold text-indigo-600 hover:underline"
          >
            Upgrade
          </button>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5 text-slate-500">
        <div>
          <div className="flex justify-between text-[11px]">
            <span>Bills</span>
            <span className="font-semibold text-slate-700">
              {usage.billsCount} / {isPro ? "∞" : "50"}
            </span>
          </div>
          {!isPro && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${usage.billsCount >= 45 ? "bg-red-500" : "bg-indigo-600"}`}
                style={{ width: `${Math.min(100, (usage.billsCount / 50) * 100)}%` }}
              />
            </div>
          )}
        </div>

        <div>
          <div className="flex justify-between text-[11px]">
            <span>AI templates</span>
            <span className="font-semibold text-slate-700">
              {usage.aiGenerationsUsed} / {isPro ? "∞" : "5"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const userBox = (
    <div className="border-t border-slate-200 pt-3">
      <div className="flex items-center gap-3 px-2">
        <div
          onClick={() => {
            setOpen(false);
            setShowAccountModal(true);
          }}
          role="button"
          tabIndex={0}
          title="Account security & settings"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 hover:ring-2 hover:ring-indigo-300 transition"
        >
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div
          onClick={() => {
            setOpen(false);
            setShowAccountModal(true);
          }}
          role="button"
          tabIndex={0}
          title="Manage Google sign-in, password & account data"
          className="group min-w-0 flex-1 cursor-pointer rounded-lg p-1 transition hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <div className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition">
            {user.name}
          </div>
          <div className="truncate text-xs text-slate-500">
            {user.businessName || user.email}
          </div>
        </div>
        <button onClick={logout} title="Log out" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
            <FileText className="h-4 w-4" />
          </div>
          <span className="font-bold text-slate-900 tracking-tight">BillFlow</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition active:scale-95"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer & backdrop */}
      {open && (
        <>
          <div
            className="fixed inset-0 top-[57px] z-20 bg-slate-900/40 backdrop-blur-xs transition-opacity lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 top-[57px] z-30 max-h-[calc(100vh-57px)] overflow-y-auto border-b border-slate-200 bg-white p-4 shadow-xl transition lg:hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {nav}
            {quotaWidget}
            {!isPro && <AdBanner variant="sidebar" />}
            <div className="mt-3">{userBox}</div>
          </div>
        </>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-slate-900">BillFlow</span>
        </Link>
        {nav}
        {quotaWidget}
        {!isPro && <AdBanner variant="sidebar" />}
        {userBox}
      </aside>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={user.plan}
      />

      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        user={user}
      />
    </>
  );
}
