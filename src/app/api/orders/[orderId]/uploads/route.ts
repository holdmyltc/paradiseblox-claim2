import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { createUploadSlots } from "@/lib/storage";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  purpose: z.enum(["chat", "proof"]).default("chat"),
  files: z.array(z.object({ type: z.string(), size: z.number().int().positive() })).min(1).max(10),
});

/** Hands out one-time upload links so screenshots go straight to private storage. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const input = schema.parse(await request.json());
    const db = supabaseAdmin();
    const [{ data: order }, admin] = await Promise.all([
      db.from("orders").select("id,email,chat_locked,status").eq("id", orderId).maybeSingle(),
      requireAdmin(request),
    ]);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!admin) {
      const session = await readCustomerSession();
      if (!canAccessOrder(session, order.id, order.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      if (input.purpose !== "chat") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      if (order.chat_locked || order.status === "cancelled") return NextResponse.json({ error: "This chat is closed" }, { status: 409 });
      await enforceRateLimit(request, "chat_upload", orderId, 30, 600);
    }
    const bucket = input.purpose === "proof" ? "delivery-proofs" : "chat-attachments";
    const slots = await createUploadSlots(bucket, orderId, input.files);
    return NextResponse.json({ bucket, slots });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload could not start" }, { status: 400 });
  }
}
