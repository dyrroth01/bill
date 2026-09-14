import sharp from "sharp";
import type { CropBox } from "./types";

export interface PreparedImage {
  base64: string; // downscaled JPEG for the AI call
  mime: string;
  original: Buffer; // best-quality source for cropping
  width: number;
  height: number;
}

const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

/** Turns an uploaded bill photo/PDF into an AI-ready image (downscaled JPEG) + original for cropping. */
export async function prepareSourceImage(bytes: Buffer, mimeType: string): Promise<PreparedImage> {
  let original: Buffer;
  if (mimeType === "application/pdf") {
    const mod = (await import("pdf-to-img")) as { pdf: (b: Buffer, o?: object) => Promise<AsyncIterable<Uint8Array>> };
    const doc = await mod.pdf(bytes, { scale: 2 });
    let first: Uint8Array | null = null;
    for await (const page of doc) {
      first = page;
      break;
    }
    if (!first) throw new Error("Could not read any page from the PDF");
    original = Buffer.from(first);
  } else if (ALLOWED_IMAGE_MIMES.includes(mimeType)) {
    original = bytes;
  } else {
    throw new Error("Unsupported file type. Upload a photo (JPG/PNG) or a PDF.");
  }

  const resized = await sharp(original)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  return {
    base64: resized.toString("base64"),
    mime: "image/jpeg",
    original,
    width: meta.width || 1000,
    height: meta.height || 1000,
  };
}

/** Crops a normalized bounding box from the original image, returns PNG bytes. */
export async function cropNormalized(original: Buffer, box: CropBox): Promise<Buffer> {
  const meta = await sharp(original).metadata();
  const W = meta.width || 1000;
  const H = meta.height || 1000;
  const left = Math.max(0, Math.min(W - 8, Math.round(box.x * W)));
  const top = Math.max(0, Math.min(H - 8, Math.round(box.y * H)));
  const width = Math.max(8, Math.min(W - left, Math.round(box.w * W)));
  const height = Math.max(8, Math.min(H - top, Math.round(box.h * H)));
  return sharp(original).extract({ left, top, width, height }).png().toBuffer();
}

/**
 * Comprehensive HTML sanitizer for bill templates.
 * Strips active executable code, dangerous tags, inline event handlers,
 * and script-bearing URI schemes while preserving CSS styles and table layouts.
 */
export function sanitizeInvoiceHtml(html: string): string {
  let cleaned = html;

  // 1. Remove dangerous executable/embed elements
  const dangerousTags = [
    "script",
    "iframe",
    "object",
    "embed",
    "applet",
    "form",
    "input",
    "button",
    "base",
    "svg",
  ];

  for (const tag of dangerousTags) {
    const pairedRegex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    const selfClosingRegex = new RegExp(`<${tag}[^>]*\\/?>`, "gi");
    cleaned = cleaned.replace(pairedRegex, "").replace(selfClosingRegex, "");
  }

  // 2. Remove meta http-equiv refreshes/redirects and dangerous links
  cleaned = cleaned
    .replace(/<meta[^>]*http-equiv[^>]*\/?>/gi, "")
    .replace(/<link[^>]*rel\s*=\s*["']?(?:import|prerender|prefetch)["']?[^>]*\/?>/gi, "");

  // 3. Remove inline event handlers (quoted and unquoted, whitespace or slash delimited)
  cleaned = cleaned.replace(/(?:\s|\/)on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ");

  // 4. Remove dangerous pseudo-protocols in attributes (javascript:, vbscript:, data:text/html)
  cleaned = cleaned.replace(
    /(?:\s|\/)(?:href|src|action|formaction|data)\s*=\s*(?:"\s*(?:javascript|vbscript|data\s*:\s*text\/html)[\s\S]*?"|'\s*(?:javascript|vbscript|data\s*:\s*text\/html)[\s\S]*?'|(?:javascript|vbscript|data\s*:\s*text\/html)[^\s>]+)/gi,
    " "
  );

  return cleaned;
}

export function stripScripts(html: string): string {
  return sanitizeInvoiceHtml(html);
}

export function ensureHtmlDoc(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" />
<style>
@page { size: 148mm 210mm; margin: 8mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 0.3mm solid #444; padding: 1.5mm; font-size: 9.5pt; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}
