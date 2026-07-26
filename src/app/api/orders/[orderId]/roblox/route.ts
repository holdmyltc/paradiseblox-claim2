import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrderById, publicOrder } from "@/lib/orders";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addSystemMessage } from "@/lib/messages";
const schema=z.object({userId:z.number(),username:z.string(),displayName:z.string(),avatarUrl:z.string().nullable()});
export async function POST(request:Request,{params}:{params:Promise<{orderId:string}>}){try{const{orderId}=await params;const order=await getOrderById(orderId);const session=await readCustomerSession();if(!order||!canAccessOrder(session,order.id,order.email))return NextResponse.json({error:"Unauthorized"},{status:403});const p=schema.parse(await request.json());const db=supabaseAdmin();await db.from("orders").update({roblox_user_id:p.userId,roblox_username:p.username,roblox_display_name:p.displayName,roblox_avatar_url:p.avatarUrl,status:order.status==="paid"?"in_progress":order.status,updated_at:new Date().toISOString()}).eq("id",order.id);await addSystemMessage(order.id,"Your Order ID and Roblox account were verified.");const updated=await getOrderById(order.id);return NextResponse.json({order:publicOrder(updated)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not save account"},{status:400})}}
