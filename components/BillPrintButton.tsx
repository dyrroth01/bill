"use client";

import { Printer } from "lucide-react";

interface BillPrintButtonProps {
  iframeId: string;
  billNo?: string;
}

export default function BillPrintButton({ iframeId, billNo }: BillPrintButtonProps) {
  function handlePrint() {
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
    const invoiceTitle = billNo ? `Invoice #${billNo}` : "Invoice";

    if (iframe && iframe.contentWindow) {
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.title = invoiceTitle;
        }
      } catch {}

      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    }

    // Fallback if iframe cannot be accessed
    const prevTitle = document.title;
    try {
      document.title = invoiceTitle;
      window.print();
    } finally {
      setTimeout(() => {
        document.title = prevTitle;
      }, 1000);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="btn-primary !py-1.5 text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
      title="Print immediately or save as PDF using your browser"
    >
      <Printer className="h-3.5 w-3.5" />
      Print / Save as PDF
    </button>
  );
}
