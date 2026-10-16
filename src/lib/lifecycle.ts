import { supabaseAdmin } from "@/lib/supabase/server";
import { addSystemMessage } from "@/lib/messages";
import { getOrderById } from "@/lib/orders";
import { logEvent } from "@/lib/audit";
import { pushToAdmins } from "@/lib/push";

/** Orders marked Delivered are treated as received this long after, if the customer does nothing. */
export const AUTO_RECEIVE_HOURS = 24;

export const SYSTEM_TEXT = {
  received: "The customer confirmed they received everything. This order is complete.",
  autoReceived: `Nothing was reported within ${AUTO_RECEIVE_HOURS} hours of delivery, so this order was marked as received and completed.`,
};

/**
 * Marks an order received and completed. Uses a conditional update so two
 * requests at the same moment can never complete it twice.
 */
export async function completeAsReceived(orderId: string, by: "customer" | "auto", request?: Request | null) {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: rows, error } = await db.from("orders").update({
    status: "completed",
    received_at: now,
    completed_at: now,
    completed_by: by,
    auto_received: by === "auto",
    updated_at: now,
  }).eq("id", orderId).eq("status", "delivered").eq("risk_hold", false).select("id");
  if (error) throw error;
  if (!rows?.length) return false;

  await logEvent(orderId, by === "auto" ? "system" : "customer", by === "auto" ? "auto_received" : "received_confirmed", request ?? null);
  await addSystemMessage(orderId, by === "auto" ? SYSTEM_TEXT.autoReceived : SYSTEM_TEXT.received);
  const order = await getOrderById(orderId);
  if (order) {
    if (by === "customer") await pushToAdmins({ title: `${order.order_number} received`, body: "The customer confirmed they got everything.", url: `/admin?order=${orderId}`, tag: `received-${orderId}`, kind: "info" });
  }
  return true;
}

/** Finds delivered orders past the 24 hour mark and completes them. Safe to call often. */
export async function autoReceiveOverdue(limit = 25) {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - AUTO_RECEIVE_HOURS * 3_600_000).toISOString();
  const { data } = await db.from("orders").select("id").eq("status", "delivered").eq("risk_hold", false)
    .not("delivered_at", "is", null).lte("delivered_at", cutoff).order("delivered_at").limit(limit);
  let done = 0;
  for (const row of data || []) {
    try { if (await completeAsReceived(row.id, "auto")) done++; } catch (e) { console.error("auto receive failed", row.id, e); }
  }
  return done;
}

/** Same check for a single order, run whenever the order is opened. */
export async function autoReceiveIfDue(order: { id: string; status: string; delivered_at: string | null; risk_hold?: boolean }) {
  if (order.status !== "delivered" || !order.delivered_at || order.risk_hold) return false;
  if (Date.now() - new Date(order.delivered_at).getTime() < AUTO_RECEIVE_HOURS * 3_600_000) return false;
  return completeAsReceived(order.id, "auto");
}
