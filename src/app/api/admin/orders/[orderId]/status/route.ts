import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { getOrderById, publicOrder } from "@/lib/orders";
import { addSystemMessage, getProofs } from "@/lib/messages";
import { sendCompletionReceipt } from "@/lib/receipt";

/**
 * Two shapes of request:
 *   { status, reason? }  -> move the order through its lifecycle
 *   { chatLocked }       -> lock/unlock the chat WITHOUT touching status
 *
 * They are separate on purpose. The old handler forced `chat_locked:false` on
 * every status change, so a manual lock would be silently undone the next time
 * anyone pressed a status button.
 */
const statusSchema = z.object({
  // "refunded" is intentionally absent: the DB check constraint does not allow
  // it yet. See the migration note if you want it as a distinct state.
  status: z.enum(["in_progress", "delivered", "completed", "cancelled"]),
  reason: z.string().optional(),
});
const lockSchema = z.object({ chatLocked: z.boolean() });
const schema = z.union([statusSchema, lockSchema]);

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { orderId } = await params;
    const input = schema.parse(await request.json());
    const order = await getOrderById(orderId);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const db = supabaseAdmin();
    const now = new Date().toISOString();

    /* ---------- chat lock toggle: no status change ---------- */
    if ("chatLocked" in input) {
      await db.from("orders").update({ chat_locked: input.chatLocked, updated_at: now }).eq("id", orderId);
      await addSystemMessage(
        orderId,
        input.chatLocked
          ? "ParadiseBlox closed this chat. The delivery record stays available."
          : "ParadiseBlox reopened this chat. You can send a message again."
      );
      return NextResponse.json({ order: publicOrder(await getOrderById(orderId)) });
    }

    /* ---------- guards ---------- */
    if (input.status === "delivered" && (await getProofs(orderId)).length === 0)
      return NextResponse.json({ error: "Upload delivery proof before marking the order delivered" }, { status: 409 });

    if (input.status === "completed" && (!input.reason?.trim() || order.status !== "delivered"))
      return NextResponse.json({ error: "A completion reason is required after delivery" }, { status: 409 });

    if (input.status === "cancelled" && !input.reason?.trim())
      return NextResponse.json({ error: "A reason is required to cancel an order" }, { status: 409 });

    if (input.status === "cancelled" && order.status === "completed")
      return NextResponse.json({ error: "Reopen the order before cancelling it" }, { status: 409 });

    /* ---------- transitions ----------
       chat_locked is NOT set here unless the transition genuinely implies it,
       so a manual lock survives ordinary status changes. */
    const updates: Record<string, unknown> = { status: input.status, updated_at: now };
    let system = "ParadiseBlox is preparing your order.";

    if (input.status === "delivered") {
      updates.delivered_at = now;
      system = "ParadiseBlox has marked the order as delivered.";
    }

    if (input.status === "completed") {
      updates.completed_at = now;
      updates.completed_by = "admin";
      updates.admin_completion_reason = input.reason?.trim();
      updates.chat_locked = true;                       // completion closes the chat
      system = `ParadiseBlox completed the order on behalf of the customer. Reason: ${input.reason?.trim()}`;
    }

    if (input.status === "cancelled") {
      // reusing admin_completion_reason as the audit field — see note below
      updates.admin_completion_reason = input.reason?.trim();
      updates.delivered_at = null;
      updates.completed_at = null;
      updates.completed_by = null;
      // deliberately NOT locking: a customer whose order was just cancelled
      // usually has questions. Lock it manually if you want it closed.
      system = `ParadiseBlox cancelled this order. Reason: ${input.reason?.trim()}`;
    }

    if (input.status === "in_progress") {
      updates.delivered_at = null;
      updates.chat_locked = false;                      // reopening always unlocks
      if (order.status === "completed" || order.status === "cancelled") {
        updates.completed_at = null;
        updates.completed_by = null;
        updates.admin_completion_reason = null;
        system = "ParadiseBlox reopened this order and the chat is active again.";
      }
    }

    await db.from("orders").update(updates).eq("id", orderId);
    await addSystemMessage(orderId, system);

    const updated = await getOrderById(orderId);
    if (input.status === "completed")
      await sendCompletionReceipt(updated).catch((error) => console.error("Receipt email failed", error));

    return NextResponse.json({ order: publicOrder(updated) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Status update failed" }, { status: 400 });
  }
}
