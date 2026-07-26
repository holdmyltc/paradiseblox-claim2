import { supabaseAdmin } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import type { ChatMessage, DeliveryProof } from "@/lib/types";

export async function getMessages(orderId: string): Promise<ChatMessage[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("messages").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all((data || []).map(async (m) => ({
    id: m.id,
    sender: m.sender,
    body: m.body,
    createdAt: m.created_at,
    attachmentUrl: await signedUrl("chat-attachments", m.attachment_path),
    attachmentName: m.attachment_name,
    attachmentMime: m.attachment_mime,
  })));
}

export async function getProofs(orderId: string): Promise<DeliveryProof[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("delivery_proofs").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all((data || []).map(async (p) => ({
    id: p.id,
    note: p.note,
    createdAt: p.created_at,
    fileUrl: (await signedUrl("delivery-proofs", p.file_path)) || "",
    fileName: p.file_name,
    mimeType: p.mime_type,
  })));
}

export async function addSystemMessage(orderId: string, body: string) {
  const db = supabaseAdmin();
  await db.from("messages").insert({ order_id: orderId, sender: "system", body });
}
