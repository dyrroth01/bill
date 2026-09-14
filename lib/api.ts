import { NextResponse } from "next/server";
import { UnauthorizedError } from "./auth";
import { computeTotals } from "./context";
import { amountToWords, round2 } from "./format";
import type { BillDraft, BillItem, TemplateBlocks, TemplateField } from "./types";
import { DEFAULT_BLOCKS } from "./types";

export function apiError(e: unknown): NextResponse {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const msg = e instanceof Error ? e.message : "Something went wrong";
  console.error("API error:", e);
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function toUtcDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string" || !s.trim()) return null;
  const clean = s.trim();

  // 1. Check if YYYY-MM-DD format (with optional time)
  const ymdMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2. Check if DD/MM/YYYY or DD-MM-YYYY format
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    let p1 = parseInt(dmyMatch[1], 10);
    let p2 = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    // If p1 > 12, it's definitely DD/MM/YYYY
    // If p2 > 12, it's definitely MM/DD/YYYY
    // Otherwise in Indian business context, default to DD/MM/YYYY
    let day = p1;
    let month = p2;
    if (p1 <= 12 && p2 > 12) {
      month = p1;
      day = p2;
    }
    const dt = new Date(Date.UTC(y, month - 1, day));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3. Fallback to native Date parsing
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }

  return null;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Tolerant parse of a bill draft coming from the client form. */
export function parseDraft(body: Record<string, unknown>): BillDraft {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: BillItem[] = rawItems.map((it) => {
    const o = (it || {}) as Record<string, unknown>;
    const qty = num(o.qty, 1);
    const rate = num(o.rate, 0);
    const explicitAmount = o.amount !== undefined && o.amount !== "" ? num(o.amount) : undefined;
    const amount = explicitAmount !== undefined ? round2(explicitAmount) : round2(qty * rate);
    return {
      description: str(o.description),
      hsn: str(o.hsn),
      qty,
      unit: str(o.unit),
      rate,
      amount,
    };
  });
  const extra: Record<string, string> = {};
  if (body.extra && typeof body.extra === "object") {
    for (const [k, v] of Object.entries(body.extra as Record<string, unknown>)) {
      if (v !== null && v !== undefined && String(v).trim() !== "") extra[k] = str(v);
    }
  }
  const client = (body.client && typeof body.client === "object" ? body.client : {}) as Record<string, unknown>;
  return {
    billNo: str(body.billNo).trim(),
    billDate: str(body.billDate).slice(0, 10) || new Date().toISOString().slice(0, 10),
    dueDate: body.dueDate ? str(body.dueDate).slice(0, 10) : undefined,
    client: {
      name: str(client.name).trim(),
      address: str(client.address),
      phone: str(client.phone),
      gstin: str(client.gstin),
    },
    items,
    extra,
    cgstRate: num(body.cgstRate, 0),
    sgstRate: num(body.sgstRate, 0),
    igstRate: num(body.igstRate, 0),
    amountInWords: str(body.amountInWords),
    notes: str(body.notes),
    chequeNo: str(body.chequeNo),
  };
}

export interface DraftValidationResult {
  valid: boolean;
  error?: string;
  fieldErrors: Record<string, string>;
}

export function validateDraftFields(draft: BillDraft): DraftValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (!draft.billNo || !draft.billNo.trim()) {
    fieldErrors.billNo = "Bill number is required";
  }

  if (!draft.billDate || !draft.billDate.trim()) {
    fieldErrors.billDate = "Bill date is required";
  } else {
    const parsedDate = toUtcDate(draft.billDate);
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      fieldErrors.billDate = "Please enter a valid bill date";
    }
  }

  if (draft.dueDate && draft.dueDate.trim()) {
    const parsedDueDate = toUtcDate(draft.dueDate);
    if (!parsedDueDate || isNaN(parsedDueDate.getTime())) {
      fieldErrors.dueDate = "Please enter a valid due date";
    }
  }

  if (!draft.client?.name || !draft.client.name.trim()) {
    fieldErrors.clientName = "Client / M-s name is required";
  }

  if (!draft.items || !draft.items.length) {
    fieldErrors.items = "Add at least one item to the bill";
  } else {
    const hasValidItem = draft.items.some(
      (it) => (it.description && it.description.trim().length > 0) || (Number(it.amount) || 0) > 0
    );
    if (!hasValidItem) {
      fieldErrors.items = "Items cannot all be empty — enter a description or amount";
    }
  }

  const valid = Object.keys(fieldErrors).length === 0;
  const firstKey = Object.keys(fieldErrors)[0];
  return {
    valid,
    error: firstKey ? fieldErrors[firstKey] : undefined,
    fieldErrors,
  };
}

export function validateDraft(draft: BillDraft): string | null {
  const res = validateDraftFields(draft);
  return res.valid ? null : (res.error || "Please fix validation errors");
}

export function draftTotals(draft: BillDraft) {
  const totals = computeTotals(draft.items, draft.cgstRate, draft.sgstRate, draft.igstRate);
  const words =
    draft.amountInWords && draft.amountInWords.trim() ? draft.amountInWords.trim() : amountToWords(totals.total);
  return { ...totals, words };
}

export function parseBlocks(json: string | null | undefined): TemplateBlocks {
  try {
    const o = JSON.parse(json || "{}");
    return { ...DEFAULT_BLOCKS, ...(typeof o === "object" && o ? o : {}) };
  } catch {
    return { ...DEFAULT_BLOCKS };
  }
}

export function parseFields(json: string | null | undefined): TemplateField[] {
  try {
    const o = JSON.parse(json || "[]");
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}

/** Creates or reuses a client record for a bill's client info. */
export async function upsertClient(userId: string, draft: BillDraft): Promise<string | null> {
  const { db } = await import("./db");
  if (!draft.client.name) return null;
  const existing = await db.client.findFirst({
    where: { userId, name: { equals: draft.client.name } },
  });
  if (existing) {
    const patch: Record<string, string> = {};
    if (draft.client.address && !existing.address) patch.address = draft.client.address;
    if (draft.client.phone && !existing.phone) patch.phone = draft.client.phone;
    if (draft.client.email && !existing.email) patch.email = draft.client.email;
    if (draft.client.gstin && !existing.gstin) patch.gstin = draft.client.gstin;
    if (Object.keys(patch).length) {
      await db.client.update({ where: { id: existing.id }, data: patch });
    }
    return existing.id;
  }
  const created = await db.client.create({
    data: {
      userId,
      name: draft.client.name,
      address: draft.client.address || null,
      phone: draft.client.phone || null,
      email: draft.client.email || null,
      gstin: draft.client.gstin || null,
    },
  });
  return created.id;
}
