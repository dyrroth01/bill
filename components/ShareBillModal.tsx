"use client";

import { useEffect, useState } from "react";
import {
  X,
  Share2,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  FileText,
  Smartphone,
  Download,
  Send,
  AlertCircle,
  Paperclip,
} from "lucide-react";

interface ShareBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: {
    id: string;
    billNo: string;
    total?: number;
    clientName?: string;
    status?: string;
  };
}

interface ShareData {
  url: string;
  billNo: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  total: number;
  paidAmount: number;
  status: string;
  businessName: string;
  expiresAt: string;
}

export default function ShareBillModal({ isOpen, onClose, bill }: ShareBillModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [copied, setCopied] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [customPhone, setCustomPhone] = useState("");
  const [sharingPdfFile, setSharingPdfFile] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [hasFileShareSupport, setHasFileShareSupport] = useState(false);

  useEffect(() => {
    // Check if the browser supports sharing actual files
    if (typeof navigator !== "undefined" && "canShare" in navigator) {
      try {
        const dummyFile = new File(["dummy"], "dummy.pdf", { type: "application/pdf" });
        if (navigator.canShare({ files: [dummyFile] })) {
          setHasFileShareSupport(true);
        }
      } catch {
        setHasFileShareSupport(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setError("");
      setEmailStatus(null);
      return;
    }

    setLoading(true);
    setError("");

    fetch(`/api/bills/${bill.id}/pdf-link?days=30`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to generate share link");
        }
        return res.json();
      })
      .then((data: ShareData) => {
        setShareData(data);
        if (data.clientEmail) setCustomEmail(data.clientEmail);
        if (data.clientPhone) setCustomPhone(data.clientPhone);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not generate link");
      })
      .finally(() => setLoading(false));
  }, [isOpen, bill.id]);

  if (!isOpen) return null;

  const totalFormatted = shareData
    ? Number(shareData.total).toFixed(2)
    : bill.total
      ? Number(bill.total).toFixed(2)
      : "0.00";
  const billNum = shareData?.billNo || bill.billNo;
  const client = shareData?.clientName || bill.clientName || "Customer";
  const business = shareData?.businessName || "BillFlow";
  const pdfUrl = shareData?.url || "";

  // 1. Share the ACTUAL PDF FILE (via Web Share API or download fallback)
  async function shareActualPdfFile() {
    setSharingPdfFile(true);
    try {
      const res = await fetch(`/api/bills/${bill.id}/pdf`);
      if (!res.ok) throw new Error("Failed to load PDF file for sharing");
      const blob = await res.blob();
      const filename = `Invoice-${billNum.replace(/[^\w.-]/g, "_")}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice #${billNum}`,
          text: `Invoice #${billNum} from ${business} for ${client} (₹${totalFormatted})`,
        });
      } else {
        // Fallback for desktop browsers: download the PDF file and notify the user
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        alert(
          "PDF downloaded! You can now drag and drop the PDF file directly into your WhatsApp or Telegram chat."
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User closed share dialog
      } else {
        console.error("File sharing error:", err);
      }
    } finally {
      setSharingPdfFile(false);
    }
  }

  // 2. WhatsApp Message
  const whatsappMessage =
    `📄 *Invoice #${billNum}*\n` +
    `*From:* ${business}\n` +
    `*Customer:* ${client}\n` +
    `*Total Amount:* ₹${totalFormatted}\n` +
    `*Status:* ${shareData?.status || bill.status || "Pending"}\n\n` +
    `🔗 *View / Download your Bill PDF:*\n${pdfUrl}\n\n` +
    `Thank you for your business!`;

  function openWhatsApp(useDirectPhone = false) {
    let cleanPhone = customPhone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;

    const base =
      useDirectPhone && cleanPhone
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessage)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(base, "_blank", "noopener,noreferrer");
  }

  // 3. Telegram Message
  const telegramText = `📄 Invoice #${billNum} from ${business} for ${client} (₹${totalFormatted})`;

  function openTelegram() {
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(pdfUrl)}&text=${encodeURIComponent(telegramText)}`;
    window.open(tgUrl, "_blank", "noopener,noreferrer");
  }

  // 4. Send Email directly from server WITH PDF ATTACHMENT
  async function sendEmailWithPdfAttachment() {
    if (!customEmail.trim() || !customEmail.includes("@")) {
      setEmailStatus({ type: "error", message: "Please enter a valid recipient email address." });
      return;
    }

    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await fetch(`/api/bills/${bill.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: customEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch email");
      setEmailStatus({
        type: "success",
        message: `Invoice PDF sent to ${customEmail}!`,
      });
    } catch (err) {
      setEmailStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to send email",
      });
    } finally {
      setSendingEmail(false);
    }
  }

  // 5. Open in native mail client
  function openMailClient() {
    const to = encodeURIComponent(customEmail.trim());
    const subject = encodeURIComponent(`Invoice #${billNum} from ${business}`);
    const body = encodeURIComponent(
      `Hello ${client},\n\nPlease find your invoice details below:\n\n• Invoice No: #${billNum}\n• Total Amount: ₹${totalFormatted}\n• Status: ${shareData?.status || bill.status || "Pending"}\n\nView & download your official invoice PDF:\n${pdfUrl}\n\nThank you for your business!\n${business}`
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  // 6. Copy Link
  async function handleCopy() {
    if (!pdfUrl) return;
    try {
      await navigator.clipboard.writeText(pdfUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const input = document.getElementById("pdf-share-link-input") as HTMLInputElement;
      if (input) {
        input.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/70 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Share Bill & PDF</h2>
              <p className="text-xs text-slate-500">
                Bill #{billNum} · {client} · ₹{totalFormatted}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 space-y-2">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
              <p className="text-xs font-semibold text-slate-500">Preparing bill & PDF options...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-600">
              {error}
            </div>
          ) : (
            <>
              {/* PRIMARY ACTION: Direct PDF File Share (Attaches real .pdf file) */}
              <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/60 via-purple-50/30 to-white p-3.5 sm:p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
                      <Paperclip className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {hasFileShareSupport ? "Share PDF File to Apps" : "Download & Attach PDF"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {hasFileShareSupport
                          ? "Attaches the actual PDF file directly into WhatsApp, Telegram, or Mail"
                          : "Download the PDF file to drag & drop into WhatsApp Web or Telegram"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={shareActualPdfFile}
                    disabled={sharingPdfFile}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 transition w-full sm:w-auto shrink-0"
                  >
                    {sharingPdfFile ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : hasFileShareSupport ? (
                      <Share2 className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>{hasFileShareSupport ? "Share PDF File" : "Download PDF"}</span>
                  </button>
                </div>
              </div>

              {/* WHATSAPP */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-emerald-300 transition">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
                      <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">WhatsApp</h3>
                      <p className="text-xs text-slate-500">Send bill details with direct PDF link</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWhatsApp(false)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#20ba5a] transition w-full sm:w-auto shrink-0"
                  >
                    <span>Share WhatsApp</span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                  </button>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium shrink-0">To phone:</span>
                  <input
                    type="text"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="field !py-1 !text-xs w-full sm:!w-40"
                  />
                  <button
                    type="button"
                    onClick={() => openWhatsApp(true)}
                    disabled={!customPhone.trim()}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition w-full sm:w-auto text-center"
                  >
                    Send to phone
                  </button>
                </div>
              </div>

              {/* EMAIL (Both Server Send with PDF Attached & Mailto) */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-indigo-300 transition">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Email (with PDF Attached)</h3>
                    <p className="text-xs text-slate-500">Send PDF attachment directly to client's inbox</p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="field !py-1.5 !text-xs w-full sm:flex-1"
                    />
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={sendEmailWithPdfAttachment}
                        disabled={sendingEmail || !customEmail.trim()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition flex-1 sm:flex-none shrink-0"
                      >
                        {sendingEmail ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span>Send PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={openMailClient}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition flex-1 sm:flex-none text-center"
                        title="Open in your default mail app"
                      >
                        Open App
                      </button>
                    </div>
                  </div>

                  {emailStatus && (
                    <div
                      className={`rounded-lg p-2 text-xs font-semibold ${
                        emailStatus.type === "success"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-red-50 text-red-600 border border-red-200"
                      }`}
                    >
                      {emailStatus.message}
                    </div>
                  )}
                </div>
              </div>

              {/* TELEGRAM */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-sky-300 transition">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#229ED9]/15 text-[#229ED9]">
                      <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.536-.196 1.006.128.832.922z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Telegram</h3>
                      <p className="text-xs text-slate-500">Share to Telegram contact or channel</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openTelegram}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#229ED9] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#1f8ec3] transition w-full sm:w-auto shrink-0"
                  >
                    <span>Share Telegram</span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                  </button>
                </div>
              </div>

              {/* Direct PDF Link & Copy */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">Direct PDF Link</span>
                  <span className="text-[10px] text-slate-400">Valid for 30 days</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="pdf-share-link-input"
                    type="text"
                    readOnly
                    value={pdfUrl}
                    className="field !py-1 font-mono !text-xs bg-white text-slate-600 select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
