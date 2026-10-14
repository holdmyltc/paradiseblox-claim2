import { supabaseAdmin } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import type { ChatMessage, DeliveryProof } from "@/lib/types";
import { pingOrder } from "@/lib/realtime";

/**
 * Signed URLs were being regenerated on every request. Two costs:
 *   1. one storage API round trip per attachment, per poll
 *   2. the URL changed each time, so the browser cache never hit and every
 *      attachment image re-downloaded on every poll
 *
 * Caching by path fixes both. Keep TTL comfortably below whatever expiry
 * signedUrl() issues, or you'll hand out URLs that die before they're used.
 */
const URL_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const urlCache = new Map<string, { url: string | null; expires: number }>();

async function cachedSignedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;                       // no attachment, no API call
  const key = `${bucket}:${path}`;
  const hit = urlCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;

  const url = await signedUrl(bucket, path);
  urlCache.set(key, { url, expires: Date.now() + URL_TTL_MS });

  // cheap eviction so a long-lived server process doesn't grow without bound
  if (urlCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of urlCache) if (v.expires <= now) urlCache.delete(k);
  }
  return url;
}

/** Map one DB row to the client shape. Exported so POST can return the row it
 *  just inserted instead of re-reading and re-signing the whole thread. */
export async function toChatMessage(m: any): Promise<ChatMessage> {
  return {
    id: m.id,
    sender: m.sender,
    body: m.body,
    createdAt: m.created_at,
    attachmentUrl: await cachedSignedUrl("chat-attachments", m.attachment_path),
    attachmentName: m.attachment_name,
    attachmentMime: m.attachment_mime,
  };
}

export async function getMessages(orderId: string): Promise<ChatMessage[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("messages")
    .select("id,sender,body,created_at,attachment_path,attachment_name,attachment_mime")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all((data || []).map(toChatMessage));
}

export async function getProofs(orderId: string): Promise<DeliveryProof[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("delivery_proofs").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all((data || []).map(async (p) => ({
    id: p.id,
    note: p.note,
    createdAt: p.created_at,
    fileUrl: (await cachedSignedUrl("delivery-proofs", p.file_path)) || "",
    fileName: p.file_name,
    mimeType: p.mime_type,
  })));
}

export async function addSystemMessage(orderId: string, body: string) {
  const db = supabaseAdmin();
  await db.from("messages").insert({ order_id: orderId, sender: "system", body });
  await pingOrder(orderId);
}
