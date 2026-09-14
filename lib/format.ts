export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function inr(value: number | string | null | undefined): string {
  const n = Number(value);
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** dd-mm-yyyy, the format used on Indian bill books */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  let d: Date;
  if (value instanceof Date) d = value;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) d = new Date(value + "T00:00:00");
  else d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigit(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

/** Indian numbering system: 48700 -> "Forty Eight Thousand Seven Hundred Only" */
export function amountToWords(value: number): string {
  const n = round2(value);
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Only";

  const parts: string[] = [];
  let rest = rupees;
  const crore = Math.floor(rest / 10000000);
  rest %= 10000000;
  const lakh = Math.floor(rest / 100000);
  rest %= 100000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  const hundred = Math.floor(rest / 100);
  const two = rest % 100;

  if (crore) parts.push(`${twoDigit(crore)} Crore`);
  if (lakh) parts.push(`${twoDigit(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigit(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (two) parts.push(twoDigit(two));

  let words = (parts.join(" ") || "Zero") + " Only";
  if (paise > 0) {
    words = words.replace(/ Only$/, "") + ` and ${twoDigit(paise)} Paise Only`;
  }
  return words;
}

export function nextMonth(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
