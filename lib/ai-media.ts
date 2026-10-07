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

async function renderPdfPageToBuffer(bytes: Buffer): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  if (!pdfDoc.numPages || pdfDoc.numPages < 1) {
    throw new Error("Could not read any page from the PDF");
  }

  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await page.render({
    canvasContext: context as any,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

/** Turns an uploaded bill photo/PDF into an AI-ready image (downscaled JPEG) + original for cropping. */
export async function prepareSourceImage(bytes: Buffer, mimeType: string): Promise<PreparedImage> {
  let original: Buffer;
  if (mimeType === "application/pdf") {
    original = await renderPdfPageToBuffer(bytes);
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
