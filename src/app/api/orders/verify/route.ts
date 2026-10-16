import { NextResponse } from "next/server";
import { z } from "zod";
import { findShopifyOrder } from "@/lib/shopify";
import { getOrderByNumber, publicOrder, reclaimIfCancelled, upsertShopifyOrder } from "@/lib/orders";
import { grantOrderAccess } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/audit";

const schema = z.object({ orderId: z.string().min(1).max(50), email: z.string().email() });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await enforceRateLimit(request, "order_verify", input.orderId, 10, 600);

    let order = await getOrderByNumber(input.orderId);
    if (!order) {
      const node = await findShopifyOrder(input.orderId);
      if (!node) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      order = await upsertShopifyOrder(node);
    }

    if (order.email.toLowerCase() !== input.email.trim().toLowerCase())
      return NextResponse.json({ error: "Email does not match this order" }, { status: 403 });

    if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.financial_status))
      return NextResponse.json({ error: "This order is not currently eligible for delivery" }, { status: 403 });

    /* A cancelled order gets a clean slate here — but only once the email and
       financial-status checks above have passed, so a wrong email can never
       reset someone else's order.

       The re-fetch matters: reclaimIfCancelled writes straight to the database,
       so the `order` object in hand is stale and would report status
       "cancelled" to the client even though it is now "paid". */
    if (await reclaimIfCancelled(order.id)) {
      order = (await getOrderByNumber(input.orderId)) ?? order;
    }

    if (order.status === "cancelled")
      return NextResponse.json({ error: "This order was cancelled. Check your email, or contact support if you think this is a mistake." }, { status: 403 });

    await grantOrderAccess(order.email, order.id, { account: false });
    await logEvent(order.id, "customer", "order_verified", request);
    return NextResponse.json({ order: publicOrder(order) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Verification failed" }, { status: 400 });
  }
}
