import Handlebars from "handlebars";
import { inr, fmtDate } from "./format";

const hbs = Handlebars.create();

const MAX_TEMPLATE_LENGTH = 500 * 1024; // 500 KB ceiling to prevent ReDoS / memory exhaustion
const RUNTIME_OPTIONS = {
  allowProtoPropertiesByDefault: false,
  allowProtoMethodsByDefault: false,
};

hbs.registerHelper("inr", (v: unknown) => inr(Number(v)));
hbs.registerHelper("dateFmt", (v: unknown) => fmtDate(v as string));
hbs.registerHelper("upper", (v: unknown) => String(v ?? "").toUpperCase());

function assertSafeTemplate(html: string) {
  if (html.length > MAX_TEMPLATE_LENGTH) {
    throw new Error(`Template exceeds maximum permitted size (${Math.round(MAX_TEMPLATE_LENGTH / 1024)} KB)`);
  }
  if (/\{\{[^}]*(?:__proto__|constructor|prototype)[^}]*\}\}/i.test(html)) {
    throw new Error("Template contains prohibited prototype access expressions");
  }
}

export function renderBillTemplate(html: string, context: Record<string, unknown>): string {
  assertSafeTemplate(html);
  const compiled = hbs.compile(html, { noEscape: false, preventIndent: true });
  return compiled(context, RUNTIME_OPTIONS);
}

export function validateTemplateHtml(html: string, context: Record<string, unknown>): { ok: boolean; error?: string } {
  try {
    assertSafeTemplate(html);
    const compiled = hbs.compile(html, { noEscape: false, preventIndent: true });
    compiled(context, RUNTIME_OPTIONS);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
