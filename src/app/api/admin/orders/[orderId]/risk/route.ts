import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { getOrderById, publicOrder } from "@/lib/orders";
import { addSystemMessage } from "@/lib/messages";
import { logEvent } from "@/lib/audit";

const schema = z.object({ action: z.enum(["approve", "cancel"]), reason: z.string().max(500).optional() });

/** Approve a held order so you can deliver it, or cancel it. Refunds are done in Shopify. */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const { orderId } = await params;
    const input = schema.parse(await request.json());
    const order = await getOrderById(orderId);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const db = supabaseAdmin();
    const now = new Date().toISOString();

    if (input.action === "approve") {
      await db.from("orders").update({ risk_hold: false, risk_decision: "approved", risk_decided_at: now, updated_at: now }).eq("id", orderId);
      await logEvent(orderId, "admin", "risk_approved", request, input.reason ? { note: input.reason } : {});
      await addSystemMessage(orderId, "Your order passed our security review. We'll start delivering it now.");
    } else {
      const reason = input.reason?.trim() || "Payment could not be verified";
      await db.from("orders").update({
        status: "cancelled",
        risk_hold: false,
        risk_decision: "cancelled",
        risk_decided_at: now,
        admin_completion_reason: reason,
        chat_locked: true,
        updated_at: now,
      }).eq("id", orderId);
      await logEvent(orderId, "admin", "risk_cancelled", request, { reason });
      await addSystemMessage(orderId, `This order was cancelled after our security review. Reason: ${reason}. Any refund will go back to your original payment method.`);
    }
    return NextResponse.json({ order: publicOrder(await getOrderById(orderId), { admin: true }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 400 });
  }
}
