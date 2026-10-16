import { randomToken } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Screenshots only. The browser converts anything else (webp, gif, heic) to JPEG before upload. */
export const UPLOAD_TYPES = new Set(["image/png", "image/jpeg"]);
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 10;
export type Bucket = "chat-attachments" | "delivery-proofs";

export type UploadedFile = { path: string; name: string; mime: string; size: number };

/**
 * Files go straight from the browser to private storage using a one-time
 * signed upload link. Sending them through the server hit Vercel's 4.5 MB
 * limit and made big screenshots fail.
 */
export async function createUploadSlots(bucket: Bucket, orderId: string, files: Array<{ type: string; size: number }>) {
  if (!files.length) throw new Error("No files to upload");
  if (files.length > MAX_FILES_PER_MESSAGE) throw new Error(`You can send up to ${MAX_FILES_PER_MESSAGE} screenshots at a time`);
  const db = supabaseAdmin();
  const slots = [];
  for (const f of files) {
    if (!UPLOAD_TYPES.has(f.type)) throw new Error("Only screenshots (PNG or JPG) can be sent");
    if (!f.size || f.size > MAX_UPLOAD_BYTES) throw new Error("Each screenshot must be 8 MB or smaller");
    const ext = f.type === "image/png" ? "png" : "jpg";
    const path = `${orderId}/${Date.now()}-${randomToken(9)}.${ext}`;
    const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message || "Upload could not start");
    slots.push({ path: data.path || path, token: data.token });
  }
  return slots;
}

/** Checks that each file really was uploaded for this order, is a real screenshot and isn't too big. */
export async function verifyUploads(bucket: Bucket, orderId: string, files: Array<{ path: string; name: string }>): Promise<UploadedFile[]> {
  if (files.length > MAX_FILES_PER_MESSAGE) throw new Error(`You can send up to ${MAX_FILES_PER_MESSAGE} screenshots at a time`);
  const db = supabaseAdmin();
  const out: UploadedFile[] = [];
  for (const f of files) {
    const prefix = `${orderId}/`;
    if (!f.path.startsWith(prefix) || f.path.includes("..") || f.path.slice(prefix.length).includes("/")) throw new Error("Invalid upload");
    const fileName = f.path.slice(prefix.length);
    const { data, error } = await db.storage.from(bucket).list(orderId, { search: fileName, limit: 5 });
    if (error) throw new Error("Upload could not be checked");
    const obj = (data || []).find((o) => o.name === fileName);
    if (!obj) throw new Error("A screenshot didn't finish uploading. Please try again.");
    const mime = String((obj.metadata as any)?.mimetype || "");
    const size = Number((obj.metadata as any)?.size || 0);
    if (!UPLOAD_TYPES.has(mime)) {
      await db.storage.from(bucket).remove([f.path]);
      throw new Error("Only screenshots (PNG or JPG) can be sent");
    }
    if (size > MAX_UPLOAD_BYTES) {
      await db.storage.from(bucket).remove([f.path]);
      throw new Error("Each screenshot must be 8 MB or smaller");
    }
    const name = (f.name || fileName).replace(/[^\w.\- ()]/g, "_").slice(0, 120) || fileName;
    out.push({ path: f.path, name, mime, size });
  }
  return out;
}

export async function signedUrl(bucket: string, path: string | null, seconds = 24 * 60 * 60) {
  if (!path) return null;
  const db = supabaseAdmin();
  const { data } = await db.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl || null;
}

export async function downloadFile(bucket: string, path: string) {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
