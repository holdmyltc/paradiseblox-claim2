"use client";
import { supabaseBrowser } from "@/lib/supabase/client";

export type UploadResult = { path: string; name: string };

/** Uploads screenshots straight to private storage, then returns their paths for the message. */
export async function uploadImages(orderId: string, files: File[], purpose: "chat" | "proof", adminToken?: string | null): Promise<UploadResult[]> {
  if (!files.length) return [];
  const r = await fetch(`/api/orders/${orderId}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}) },
    body: JSON.stringify({ purpose, files: files.map((f) => ({ type: f.type, size: f.size })) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Upload could not start");
  const storage = supabaseBrowser().storage.from(d.bucket);
  const out: UploadResult[] = [];
  await Promise.all(d.slots.map(async (slot: { path: string; token: string }, i: number) => {
    const file = files[i];
    const { error } = await storage.uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("A screenshot didn't upload. Check your connection and try again.");
    out[i] = { path: slot.path, name: file.name };
  }));
  return out;
}
