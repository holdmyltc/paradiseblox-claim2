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

  await syncOrderItems(order.id, mapped.items);
  return getOrderById(order.id);
}

type MappedItem = ReturnType<typeof mapShopifyOrder>["items"][number];

/**
 * Updates the order's items without wiping their delivery ticks. The old
 * version deleted and re-inserted every item on each Shopify sync, which would
 * reset "delivered" back to "pending" every time a customer opened their order
 * history.
 */
async function syncOrderItems(orderId: string, items: MappedItem[]) {
  const db = supabaseAdmin();
  const { data: existing, error } = await db.from("order_items").select("id,shopify_line_item_gid").eq("order_id", orderId);
  if (error) throw error;
  const byLine = new Map<string, string>();
  const unmatched: string[] = [];
  for (const row of existing || []) {
    if (row.shopify_line_item_gid && !byLine.has(row.shopify_line_item_gid)) byLine.set(row.shopify_line_item_gid, row.id);
    else unmatched.push(row.id);
  }
  const keep = new Set<string>();
  for (const item of items) {
    const fields = {
      shopify_line_item_gid: item.shopifyLineItemId,
      name: item.name,
      variant_title: item.variantTitle,
      custom_attributes: item.attributes,
      quantity: item.quantity,
      sku: item.sku,
      image_url: item.imageUrl,
      game: item.game,
    };
    const id = item.shopifyLineItemId ? byLine.get(item.shopifyLineItemId) : undefined;
    if (id) {
      keep.add(id);
      const { error: e } = await db.from("order_items").update(fields).eq("id", id);
      if (e) throw e;
    } else {
      const { data: inserted, error: e } = await db.from("order_items").insert({ order_id: orderId, ...fields }).select("id").single();
      if (e) throw e;
      keep.add(inserted.id);
    }
  }
  const remove = [...(existing || []).map((r) => r.id)].filter((id) => !keep.has(id));
  if (remove.length) {
    const { error: e } = await db.from("order_items").delete().in("id", remove);
    if (e) throw e;
  }
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
  const { data } = await db.from("orders").select("status,risk_decision").eq("id", orderId).maybeSingle();
  if (data?.status !== "cancelled") return false;
  // An order cancelled after a risk review stays cancelled. Otherwise the
  // customer could simply claim it again.
  if (data?.risk_decision === "cancelled") return false;

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
    received_at: null,
    auto_received: false,
    consent_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);
  await db.from("order_items").update({ delivery_status: "pending", delivery_updated_at: null }).eq("order_id", orderId);

  return true;
}

export function isOffline(storeStatus: string | null | undefined) {
  return storeStatus !== "online";
}

export function publicOrder(order: any, options: { admin?: boolean } = {}): PublicOrder {
  const storeStatus = order.store_status === "online" ? "online" : "offline";
  const base: PublicOrder = {
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
      deliveryStatus: item.delivery_status === "delivered" || item.delivery_status === "missing" ? item.delivery_status : "pending",
    })),
    chatLocked: Boolean(order.chat_locked),
    deliveredAt: order.delivered_at,
    receivedAt: order.received_at || null,
    completedAt: order.completed_at,
    completedBy: order.completed_by,
    storeStatus,
    trustpilotUrl: TRUSTPILOT_URL,
    onHold: Boolean(order.risk_hold) && order.status !== "cancelled",
    claimRequestedAt: order.claim_link_sent_at || null,
  };
  if (options.admin) {
    base.email = order.email;
    base.risk = {
      level: order.risk_level || null,
      reasons: Array.isArray(order.risk_reasons) ? order.risk_reasons : [],
      hold: Boolean(order.risk_hold),
      decision: order.risk_decision || null,
      pending: Boolean(order.risk_pending),
      checkoutIp: order.checkout_ip || null,
      billingCountry: order.billing_country || null,
      customerOrderCount: order.customer_order_count ?? null,
    };
  }
  return base;
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}
