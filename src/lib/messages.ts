import { supabaseAdmin } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import type { ChatAttachment, ChatMessage, DeliveryProof } from "@/lib/types";
import { pingOrder } from "@/lib/realtime";

/**
 * Signed links last 24 hours and are cached for 1 hour, so an open chat never
 * shows broken images and the browser can cache them.
 */
const URL_TTL_MS = 60 * 60 * 1000;
const urlCache = new Map<string, { url: string | null; expires: number }>();

export async function cachedSignedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const key = `${bucket}:${path}`;
  const hit = urlCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const url = await signedUrl(bucket, path);
  urlCache.set(key, { url, expires: Date.now() + URL_TTL_MS });
  if (urlCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of urlCache) if (v.expires <= now) urlCache.delete(k);
  }
  return url;
}

export const MESSAGE_COLUMNS = "id,sender,body,created_at,attachment_path,attachment_name,attachment_mime,attachments,read_by_customer_at,read_by_admin_at";

export async function toChatMessage(m: any): Promise<ChatMessage> {
  const list: Array<{ path: string; name: string; mime: string }> = Array.isArray(m.attachments) && m.attachments.length
    ? m.attachments
    : m.attachment_path ? [{ path: m.attachment_path, name: m.attachment_name || "attachment", mime: m.attachment_mime || "" }] : [];
  const attachments: ChatAttachment[] = await Promise.all(list.map(async (a) => ({
    url: await cachedSignedUrl("chat-attachments", a.path),
    name: a.name,
    mime: a.mime,
  })));
  return {
    id: m.id,
    sender: m.sender,
    body: m.body,
    createdAt: m.created_at,
    attachments,
    readByCustomerAt: m.read_by_customer_at || null,
    readByAdminAt: m.read_by_admin_at || null,
  };
}

/** Whole thread, or only messages newer than `after` when the chat just needs to catch up. */
export async function getMessages(orderId: string, after?: string | null): Promise<ChatMessage[]> {
  const db = supabaseAdmin();
  let q = db.from("messages").select(MESSAGE_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: true });
  if (after) q = q.gt("created_at", after);
  const { data, error } = await q;
  if (error) throw error;
  return Promise.all((data || []).map(toChatMessage));
}

/** Raw rows with storage paths, for the evidence PDF. */
export async function getMessageRows(orderId: string) {
  const { data, error } = await supabaseAdmin().from("messages").select(MESSAGE_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
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
