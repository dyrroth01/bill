import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BillFlow — Digital bills & billing CRM",
  description:
    "Create digital bills in PDF from your existing bill book, manage paid / pending / overdue payments, all in one CRM-style dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
