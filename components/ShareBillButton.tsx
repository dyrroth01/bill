"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import ShareBillModal from "./ShareBillModal";

interface ShareBillButtonProps {
  bill: {
    id: string;
    billNo: string;
    total?: number;
    clientName?: string;
    status?: string;
  };
  variant?: "button" | "icon" | "secondary";
  className?: string;
  label?: string;
}

export default function ShareBillButton({
  bill,
  variant = "button",
  className = "",
  label = "Share",
}: ShareBillButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 ${className}`}
          title="Share bill (Email, WhatsApp, Telegram)"
        >
          <Share2 className="h-4 w-4" />
        </button>
      ) : variant === "secondary" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`btn-secondary !py-1.5 text-xs inline-flex items-center gap-1.5 ${className}`}
          title="Share bill (Email, WhatsApp, Telegram)"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`btn-primary !py-1.5 text-xs inline-flex items-center gap-1.5 ${className}`}
          title="Share bill (Email, WhatsApp, Telegram)"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      )}

      <ShareBillModal isOpen={open} onClose={() => setOpen(false)} bill={bill} />
    </>
  );
}
