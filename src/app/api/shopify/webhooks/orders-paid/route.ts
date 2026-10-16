import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { safeEqual, randomToken, sha256 } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { findShopifyOrder } from "@/lib/shopify";
import { upsertShopifyOrder } from "@/lib/orders";
import { sendClaimLinkEmail } from "@/lib/email";
import { assessCheckoutRisk } from "@/lib/risk";
import { logEvent } from "@/lib/audit";
import { emailAdminNewOrder } from "@/lib/notify";
import { pushToAdmins } from "@/lib/push";

export const maxDuration = 30;

export async function POST(request: Request) {
  const raw = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256") || "";
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  if (!secret || !safeEqual(expected, hmac)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const webhookId = request.headers.get("x-shopify-webhook-id") || crypto.randomUUID();
  const db = supabaseAdmin();
  const { data: seen } = await db.from("webhook_events").select("id").eq("webhook_id", webhookId).maybeSingle();
  if (seen) return NextResponse.json({ ok: true, deduplicated: true });

  try {
    const payload = JSON.parse(raw);
    const orderNumber = payload.name || `#${payload.order_number}`;
    const node = await findShopifyOrder(orderNumber);
    if (!node) return NextResponse.json({ error: "Shopify order lookup failed" }, { status: 502 });
    const order = await upsertShopifyOrder(node);
    if (!order) return NextResponse.json({ error: "Order could not be saved" }, { status: 500 });

    const isNew = !order.claim_link_sent_at;
    if (isNew) {
      const token = randomToken(32);
      await db.from("orders").update({ claim_token_hash: sha256(token), claim_token_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString() }).eq("id", order.id);
      try {
        await sendClaimLinkEmail(order.email, order.order_number, token);
        await db.from("orders").update({ claim_link_sent_at: new Date().toISOString() }).eq("id", order.id);
      } catch (error) {
        await db.from("orders").update({ claim_token_hash: null, claim_token_expires_at: null }).eq("id", order.id);
        throw error;
      }
    }

    // Only mark this webhook as handled once everything above worked. Before,
    // it was saved first, so if the email failed Shopify's retry was ignored
    // and the customer never got their link.
    await db.from("webhook_events").insert({ webhook_id: webhookId, topic: request.headers.get("x-shopify-topic") || "orders/paid" });

    if (isNew) {
      after(async () => {
        const risk = await assessCheckoutRisk(order.id).catch((e) => { console.error("risk check failed", e); return null; });
        if (risk && risk.level !== "low") await logEvent(order.id, "system", "risk_flagged", null, { level: risk.level, reasons: risk.reasons });
        const money = new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency || "USD" }).format(Number(order.total_amount) || 0);
        await pushToAdmins({
          title: risk?.hold ? `${order.order_number} on hold (high risk)` : `New order ${order.order_number}`,
          body: `${money}${risk?.level === "medium" ? ", medium risk, check before delivering" : ""}`,
          url: `/admin?order=${order.id}`,
          tag: `order-${order.id}`,
          kind: risk?.hold ? "risk" : "order",
        });
        await emailAdminNewOrder({ ...order, risk_level: risk?.level ?? null, risk_hold: risk?.hold ?? false }).catch((e) => console.error("admin order email failed", e));
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("orders-paid webhook failed", error);
    return NextResponse.json({ error: "Webhook failed, Shopify will retry" }, { status: 500 });
  }
}
