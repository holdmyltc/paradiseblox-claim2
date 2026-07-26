import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/config";
import { randomToken } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function uploadPrivateFile(bucket: "chat-attachments" | "delivery-proofs", orderId: string, file: File) {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) throw new Error("Unsupported file type");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File must be 8 MB or smaller");
  const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const path = `${orderId}/${Date.now()}-${randomToken(8)}.${ext}`;
  const db = supabaseAdmin();
  const { error } = await db.storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, name: file.name, mime: file.type };
}

export async function signedUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const db = supabaseAdmin();
  const { data } = await db.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}
