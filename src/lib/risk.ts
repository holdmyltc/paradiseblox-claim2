import { shopifyGraphql } from "@/lib/shopify";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { RiskLevel } from "@/lib/types";

/**
 * How orders get flagged.
 *
 * HIGH (order goes on hold until you approve it):
 *   - Shopify's fraud check rates it high, or recommends cancelling
 *
 * MEDIUM (a warning tag for you, nothing changes for the customer):
 *   - Shopify suggests investigating, or rates it medium
 *   - A first-time customer spending FIRST_ORDER_BIG or more
 *   - FAST_ORDER_COUNT or more paid orders from one email within an hour
 *   - The order is claimed from a different country to the card's billing country
 *   - The Roblox account has been used with SHARED_ROBLOX_EMAILS or more emails
 */
export const FIRST_ORDER_BIG = 100;
export const FAST_ORDER_COUNT = 3;
export const SHARED_ROBLOX_EMAILS = 3;
/** Shopify's check can take a little while after payment. Keep re-checking for this long. */
export const RISK_RECHECK_MINUTES = 120;

type ShopifyRisk = {
  order: {
    clientIp: string | null;
    billingAddress: { countryCodeV2: string | null } | null;
    customer: { numberOfOrders: string | number | null } | null;
    risk: {
      recommendation: string | null;
      assessments: Array<{ riskLevel: string | null; facts: Array<{ description: string; sentiment: string }> }>;
    } | null;
  } | null;
};

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
function max(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RANK[b] > RANK[a] ? b : a;
}

async function fetchShopifyRisk(orderGid: string) {
  try {
    const data = await shopifyGraphql<ShopifyRisk>(`
      query OrderRisk($id: ID!) {
        order(id: $id) {
          clientIp
          billingAddress { countryCodeV2 }
          customer { numberOfOrders }
          risk { recommendation assessments { riskLevel facts { description sentiment } } }
        }
      }
    `, { id: orderGid });
    return data.order;
  } catch (error) {
    // If the full query is ever rejected, still try to get the risk part on its own.
    console.error("Shopify risk query failed, retrying with risk only", error);
    try {
      const data = await shopifyGraphql<ShopifyRisk>(`
        query OrderRiskOnly($id: ID!) {
          order(id: $id) { risk { recommendation assessments { riskLevel facts { description sentiment } } } }
        }
      `, { id: orderGid });
      return data.order ? { clientIp: null, billingAddress: null, customer: null, risk: data.order.risk } : null;
    } catch (inner) {
      console.error("Shopify risk-only query failed", inner);
      return null;
    }
  }
}

/** Checks an order at payment time (and again a few times after, while Shopify is still deciding). */
export async function assessCheckoutRisk(orderId: string) {
  const db = supabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return null;

  const shopify = await fetchShopifyRisk(order.shopify_order_gid);
  let level: RiskLevel = "low";
  const reasons: string[] = [];
  let pending = false;

  if (shopify?.risk) {
    const rec = (shopify.risk.recommendation || "").toUpperCase();
    const levels = (shopify.risk.assessments || []).map((a) => (a.riskLevel || "").toUpperCase());
    if (!levels.length || levels.every((l) => l === "PENDING" || l === "NONE" || l === "")) pending = true;
    if (rec === "CANCEL") { level = "high"; reasons.push("Shopify recommends cancelling this order"); }
    if (levels.includes("HIGH")) { level = "high"; reasons.push("Shopify's fraud check rated this order high risk"); }
    if (rec === "INVESTIGATE" && level !== "high") { level = max(level, "medium"); reasons.push("Shopify suggests checking this order"); }
    if (levels.includes("MEDIUM") && level !== "high") { level = max(level, "medium"); reasons.push("Shopify's fraud check rated this order medium risk"); }
    for (const a of shopify.risk.assessments || []) {
      for (const f of a.facts || []) {
        if ((f.sentiment || "").toUpperCase() === "NEGATIVE" && f.description) reasons.push(`Shopify: ${f.description}`);
      }
    }
  } else {
    pending = true;
  }

  const orderCount = shopify?.customer?.numberOfOrders != null ? Number(shopify.customer.numberOfOrders) : order.customer_order_count;
  const total = Number(order.total_amount) || 0;
  if (orderCount != null && orderCount <= 1 && total >= FIRST_ORDER_BIG) {
    level = max(level, "medium");
    reasons.push(`First order from this customer, and it's over $${FIRST_ORDER_BIG}`);
  }

  const since = new Date(new Date(order.shopify_created_at || order.created_at).getTime() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await db.from("orders").select("id", { count: "exact", head: true })
    .eq("email", order.email).gte("shopify_created_at", since).neq("status", "cancelled");
  if ((recent || 0) >= FAST_ORDER_COUNT) {
    level = max(level, "medium");
    reasons.push(`${recent} orders from this email within an hour`);
  }

  // Keep anything the claim-time check already found.
  const claimReasons: string[] = (Array.isArray(order.risk_reasons) ? order.risk_reasons : []).filter((r: string) => r.startsWith("Claimed from") || r.startsWith("This Roblox account"));
  if (claimReasons.length) level = max(level, "medium");
  const allReasons = [...new Set([...reasons, ...claimReasons])];

  const tooOld = Date.now() - new Date(order.shopify_created_at || order.created_at).getTime() > RISK_RECHECK_MINUTES * 60_000;
  const hold = level === "high" && order.risk_decision !== "approved" && order.status !== "completed" && order.status !== "cancelled";
  const wasHeld = Boolean(order.risk_hold);

  await db.from("orders").update({
    risk_level: level,
    risk_reasons: allReasons,
    risk_checked_at: new Date().toISOString(),
    risk_pending: pending && !tooOld,
    risk_hold: hold,
    checkout_ip: shopify?.clientIp ?? order.checkout_ip ?? null,
    billing_country: shopify?.billingAddress?.countryCodeV2 ?? order.billing_country ?? null,
    customer_order_count: orderCount ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);

  return { level, reasons: allReasons, hold, newlyHeld: hold && !wasHeld };
}

/** Extra checks once the customer opens the order and links their Roblox account. */
export async function assessClaimRisk(orderId: string, claimCountry: string | null) {
  const db = supabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return;
  const reasons: string[] = Array.isArray(order.risk_reasons) ? [...order.risk_reasons] : [];
  let level: RiskLevel = (order.risk_level as RiskLevel) || "low";

  if (claimCountry && order.billing_country && claimCountry.toUpperCase() !== String(order.billing_country).toUpperCase()) {
    const reason = `Claimed from ${claimCountry.toUpperCase()}, but the card's billing country is ${String(order.billing_country).toUpperCase()}`;
    if (!reasons.includes(reason)) reasons.push(reason);
    level = max(level, "medium");
  }

  if (order.roblox_user_id) {
    const { data: others } = await db.from("orders").select("email").eq("roblox_user_id", order.roblox_user_id).limit(200);
    const emails = new Set((others || []).map((o) => String(o.email).toLowerCase()));
    if (emails.size >= SHARED_ROBLOX_EMAILS) {
      const reason = `This Roblox account has been used with ${emails.size} different emails`;
      if (!reasons.some((r) => r.startsWith("This Roblox account"))) reasons.push(reason);
      level = max(level, "medium");
    }
  }

  await db.from("orders").update({ risk_level: level, risk_reasons: reasons, updated_at: new Date().toISOString() }).eq("id", orderId);
}
