import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export type UploadKind = "assets" | "sources" | "pdfs";

export async function saveUpload(
  userId: string,
  kind: UploadKind,
  ext: string,
  data: Buffer | Uint8Array
): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, userId, kind);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, name), data);
  return path.relative(UPLOAD_ROOT, path.join(dir, name)).split(path.sep).join("/");
}

export async function readUpload(relPath: string): Promise<Buffer> {
  const normalizedRoot = path.resolve(UPLOAD_ROOT);
  const full = path.resolve(normalizedRoot, relPath);
  if (full !== normalizedRoot && !full.startsWith(normalizedRoot + path.sep)) {
    throw new Error("Invalid path: traversal detected");
  }
  return readFile(full);
}

export async function uploadExists(relPath: string): Promise<boolean> {
  try {
    await readUpload(relPath);
    return true;
  } catch {
    return false;
  }
}

export async function fileToDataUrl(relPath: string, mimeType: string): Promise<string> {
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
