import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { getOrderById, publicOrder } from "@/lib/orders";
export async function GET(request:Request){if(!await requireAdmin(request))return NextResponse.json({error:"Unauthorized"},{status:403});const url=new URL(request.url);const filter=url.searchParams.get("filter")||"active";const db=supabaseAdmin();let q=db.from("orders").select("id").order("updated_at",{ascending:false}).limit(200);if(filter==="active")q=q.in("status",["paid","in_progress","delivered"]);else if(filter!=="all")q=q.eq("status",filter);const{data}=await q;const rawOrders=(await Promise.all((data||[]).map((r:any)=>getOrderById(r.id)))).filter(Boolean);
const orderIds=rawOrders.map((o:any)=>o.id);
const{data:unreadRows}=orderIds.length?await db.from("messages").select("order_id").in("order_id",orderIds).eq("sender","customer").is("read_by_admin_at",null):{data:[] as any[]};
const unread=(unreadRows||[]).reduce<Record<string,number>>((acc:any,row:any)=>{acc[row.order_id]=(acc[row.order_id]||0)+1;return acc},{});
const orders=rawOrders.map((o:any)=>({...publicOrder(o),unreadCount:unread[o.id]||0,email:o.email}));const{data:setting}=await db.from("store_settings").select("value").eq("key","store_status").maybeSingle();return NextResponse.json({orders,storeStatus:setting?.value||"offline"});}
