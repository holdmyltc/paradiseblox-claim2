import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { getOrderById, publicOrder } from "@/lib/orders";
import { addSystemMessage } from "@/lib/messages";
import { logEvent } from "@/lib/audit";
import { pingOrder } from "@/lib/realtime";

const schema = z.object({ itemId: z.string().uuid(), status: z.enum(["pending", "delivered", "missing"]) });

/** Tick one item as delivered, or mark it missing so you know to refund it in Shopify. */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const { orderId } = await params;
    const input = schema.parse(await request.json());
    const db = supabaseAdmin();
    const { data: item } = await db.from("order_items").select("id,name,variant_title,delivery_status").eq("id", input.itemId).eq("order_id", orderId).maybeSingle();
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (item.delivery_status !== input.status) {
      await db.from("order_items").update({ delivery_status: input.status, delivery_updated_at: new Date().toISOString() }).eq("id", item.id);
      await logEvent(orderId, "admin", "admin_item_update", request, { item: `${item.name}${item.variant_title ? ` (${item.variant_title})` : ""}`, status: input.status });
      const label = `${item.name}${item.variant_title ? ` (${item.variant_title})` : ""}`;
      if (input.status === "missing") await addSystemMessage(orderId, `${label} couldn't be delivered. ParadiseBlox will refund this item.`);
      else if (input.status === "delivered") await pingOrder(orderId);
      else await pingOrder(orderId);
    }
    return NextResponse.json({ order: publicOrder(await getOrderById(orderId), { admin: true }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 400 });
  }
}
