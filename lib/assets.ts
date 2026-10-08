import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import os from "os";

export const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.AWS_REGION ||
  process.env.LAMBDA_TASK_ROOT ||
  (typeof process.cwd === "function" && process.cwd().startsWith("/var/task"))
);

export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : isServerless
    ? path.join(os.tmpdir(), "uploads")
    : path.join(process.cwd(), "uploads");

export type UploadKind = "assets" | "sources" | "pdfs";

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  html: "text/html",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  bin: "application/octet-stream",
};

export function mimeFromExt(ext: string): string {
  const clean = (ext || "").toLowerCase().replace(/^\./, "");
  return EXT_TO_MIME[clean] || "application/octet-stream";
}

/**
 * Saves uploaded content.
 * In serverless environments (e.g. Vercel / AWS Lambda), or when STORAGE_DRIVER="db",
 * stores directly as a persistent Data URL to prevent read-only filesystem errors
 * (e.g. /var/task/uploads) and ephemeral container loss.
 * In local/VPS environments, persists to disk under UPLOAD_ROOT with automatic graceful fallback.
 */
export async function saveUpload(
  userId: string,
  kind: UploadKind,
  ext: string,
  data: Buffer | Uint8Array,
  mimeType?: string
): Promise<string> {
  const mime = mimeType || mimeFromExt(ext);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const driver = (process.env.STORAGE_DRIVER || "auto").toLowerCase();

  // If explicitly configured for database storage or running in serverless (e.g. Vercel)
  if (driver === "db" || driver === "database" || (driver === "auto" && isServerless)) {
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  // Disk storage
  try {
    const dir = path.join(UPLOAD_ROOT, userId, kind);
    await mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
    const fullPath = path.join(dir, name);
    await writeFile(fullPath, buf);
    return path.relative(UPLOAD_ROOT, fullPath).split(path.sep).join("/");
  } catch (err) {
    // If disk write failed (e.g., read-only filesystem on serverless/container)
    console.warn(`Filesystem write to ${UPLOAD_ROOT} failed; falling back to Data URI storage:`, err);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
}

export async function readUpload(relPath: string): Promise<Buffer> {
  if (!relPath) throw new Error("Empty path");

  // 1. Data URL (database-stored asset)
  if (relPath.startsWith("data:")) {
    const comma = relPath.indexOf(",");
    const base64 = comma >= 0 ? relPath.slice(comma + 1) : relPath;
    return Buffer.from(base64, "base64");
  }

  // 2. Base64 prefix
  if (relPath.startsWith("base64:")) {
    return Buffer.from(relPath.slice(7), "base64");
  }

  // 3. Disk file
  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const full = path.resolve(normalizedRoot, relPath);
  if (full !== normalizedRoot && !full.startsWith(normalizedRoot + path.sep)) {
    throw new Error("Invalid path: traversal detected");
  }

  try {
    return await readFile(full);
  } catch (err: any) {
    // If running in serverless and not in /tmp, check if file was bundled in process.cwd()/uploads
    if (isServerless && typeof process.cwd === "function") {
      try {
        const bundleFull = path.resolve(path.join(process.cwd(), "uploads"), relPath);
        return await readFile(bundleFull);
      } catch {}
    }
    throw err;
  }
}

export async function uploadExists(relPath: string): Promise<boolean> {
  if (!relPath) return false;
  if (relPath.startsWith("data:") || relPath.startsWith("base64:")) return true;
  try {
    await readUpload(relPath);
    return true;
  } catch {
    return false;
  }
}

export async function fileToDataUrl(relPath: string, mimeType: string): Promise<string> {
  if (!relPath) return "";
  if (relPath.startsWith("data:")) {
    return relPath;
  }
  const buf = await readUpload(relPath);
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

export function extFromMime(mime: string, fallbackName = ""): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/html": "html",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  if (map[mime]) return map[mime];
  const ext = fallbackName.includes(".") ? fallbackName.split(".").pop()! : "bin";
  return ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

export function sanitizeExt(ext: string): string {
  return (ext || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
}
