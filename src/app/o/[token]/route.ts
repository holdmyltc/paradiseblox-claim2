import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantOrderAccess } from "@/lib/session";
import { readOrderLinkToken } from "@/lib/link-token";
import { SITE_URL } from "@/lib/config";
import { logEvent } from "@/lib/audit";

/** One-tap link from notification emails. Opens the order without typing anything. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orderId = readOrderLinkToken(token);
  if (!orderId) return NextResponse.redirect(`${SITE_URL}/?error=invalid-link`);
  const { data: order } = await supabaseAdmin().from("orders").select("id,email,order_number,status").eq("id", orderId).maybeSingle();
  if (!order || order.status === "cancelled") return NextResponse.redirect(`${SITE_URL}/?error=invalid-link`);
  await grantOrderAccess(order.email, order.id, { account: true });
  await logEvent(order.id, "customer", "order_link_opened", request);
  return NextResponse.redirect(`${SITE_URL}/order/${encodeURIComponent(order.order_number.replace("#", ""))}`);
}
