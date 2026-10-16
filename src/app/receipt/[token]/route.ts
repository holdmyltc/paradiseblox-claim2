import { NextResponse } from "next/server";
import { sha256 } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantOrderAccess } from "@/lib/session";
import { SITE_URL } from "@/lib/config";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = supabaseAdmin();
  const { data: order } = await db.from("orders").select("id,email,order_number,receipt_token_expires_at").eq("receipt_token_hash", sha256(token)).maybeSingle();
  if (!order || !order.receipt_token_expires_at || new Date(order.receipt_token_expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${SITE_URL}/?error=invalid-receipt`);
  }
  await grantOrderAccess(order.email, order.id, { account: true });
  return NextResponse.redirect(`${SITE_URL}/order/${encodeURIComponent(order.order_number.replace("#", ""))}`);
}
