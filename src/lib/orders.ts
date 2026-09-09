import { supabaseAdmin } from "@/lib/supabase/server";
import { mapShopifyOrder } from "@/lib/shopify";
import type { PublicOrder } from "@/lib/types";
import { TRUSTPILOT_URL } from "@/lib/config";

export async function upsertShopifyOrder(node: any) {
  const mapped = mapShopifyOrder(node);
  const db = supabaseAdmin();
  const { data: existing } = await db.from("orders").select("status").eq("shopify_order_gid", mapped.shopifyOrderGid).maybeSingle();
  const preservedStatus = mapped.status === "cancelled"
    ? "cancelled"
    : mapped.status === "completed"
      ? "completed"
      : existing?.status || mapped.status;
  const { data: order, error } = await db.from("orders").upsert({
    shopify_order_gid: mapped.shopifyOrderGid,
    shopify_customer_gid: mapped.shopifyCustomerGid,
    order_number: mapped.orderNumber,
    email: mapped.email,
    total_amount: mapped.totalAmount,
    currency: mapped.currency,
    financial_status: mapped.financialStatus,
    status: preservedStatus,
    shopify_created_at: mapped.createdAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "shopify_order_gid" }).select("*").single();
  if (error) throw error;

  await db.from("order_items").delete().eq("order_id", order.id);
  if (mapped.items.length) {
    const { error: itemError } = await db.from("order_items").insert(mapped.items.map((item) => ({
      order_id: order.id,
      shopify_line_item_gid: item.shopifyLineItemId,
      name: item.name,
      variant_title: item.variantTitle,
      custom_attributes: item.attributes,
      quantity: item.quantity,
      sku: item.sku,
      image_url: item.imageUrl,
      game: item.game,
    })));
    if (itemError) throw itemError;
  }
  return getOrderById(order.id);
}

export async function getOrderByNumber(orderNumber: string) {
  const normalized = orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
  const db = supabaseAdmin();
  const { data } = await db.from("orders").select("*").eq("order_number", normalized).maybeSingle();
  return data ? getOrderById(data.id) : null;
}

export async function getOrderById(id: string) {
  const db = supabaseAdmin();
  const { data: order, error } = await db.from("orders").select("*").eq("id", id).single();
  if (error) return null;
  const [{ data: items }, { data: settings }] = await Promise.all([
    db.from("order_items").select("*").eq("order_id", id).order("created_at"),
    db.from("store_settings").select("value").eq("key", "store_status").maybeSingle(),
  ]);
  return { ...order, items: items || [], store_status: settings?.value || "offline" };
}

export async function listOrdersByEmail(email: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("orders").select("id").eq("email", email.toLowerCase()).order("shopify_created_at", { ascending: false });
  const orders = await Promise.all((data || []).map((row) => getOrderById(row.id)));
  return orders.filter(Boolean);
}

/**
 * A cancelled order is dead: hidden from the admin list, and its claim page
 * 404s. But the customer is allowed to start over — order number plus email in
 * the claim form gives them a clean slate.
 *
 * Called from /api/orders/verify once the email and financial-status checks
 * have passed. It's a no-op on any other status, so it's safe to call on every
 * verify. Returns true when it actually reset something, which tells the caller
 * to re-read the row before returning it.
 */
export async function reclaimIfCancelled(orderId: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (data?.status !== "cancelled") return false;

  await db.from("orders").update({
    status: "paid",
    roblox_user_id: null,
    roblox_username: null,
    roblox_display_name: null,
    roblox_avatar_url: null,
    delivered_at: null,
    completed_at: null,
    completed_by: null,
    admin_completion_reason: null,
    chat_locked: false,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);

  return true;
}

export function publicOrder(order: any): PublicOrder {
  return {
    id: order.id,
    orderNumber: order.order_number,
    emailMasked: maskEmail(order.email),
    totalAmount: String(order.total_amount),
    currency: order.currency,
    createdAt: order.shopify_created_at || order.created_at,
    status: order.status,
    financialStatus: order.financial_status,
    roblox: order.roblox_user_id ? {
      userId: Number(order.roblox_user_id),
      username: order.roblox_username,
      displayName: order.roblox_display_name || order.roblox_username,
      avatarUrl: order.roblox_avatar_url,
    } : null,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      variantTitle: item.variant_title || null,
      attributes: Array.isArray(item.custom_attributes) ? item.custom_attributes : [],
      quantity: item.quantity,
      game: item.game,
      imageUrl: item.image_url,
      sku: item.sku,
    })),
    chatLocked: Boolean(order.chat_locked),
    deliveredAt: order.delivered_at,
    completedAt: order.completed_at,
    completedBy: order.completed_by,
    storeStatus: order.store_status,
    trustpilotUrl: TRUSTPILOT_URL,
    claimRequestedAt: order.claim_link_sent_at || null,
  };
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}
