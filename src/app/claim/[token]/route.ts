import { NextResponse } from "next/server";
import { sha256 } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeCustomerSession } from "@/lib/session";
import { SITE_URL } from "@/lib/config";
import { logEvent } from "@/lib/audit";

export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;const db=supabaseAdmin();const{data:order}=await db.from("orders").select("id,email,order_number,claim_token_expires_at").eq("claim_token_hash",sha256(token)).maybeSingle();
  if(!order||new Date(order.claim_token_expires_at).getTime()<Date.now())return NextResponse.redirect(`${SITE_URL}/?error=invalid-link`);
  await writeCustomerSession({email:order.email,orderIds:[order.id],history:false},14);
  await logEvent(order.id,"customer","claim_link_opened",request);
  return NextResponse.redirect(`${SITE_URL}/order/${encodeURIComponent(order.order_number.replace("#",""))}`);
}
