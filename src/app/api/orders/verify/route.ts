import { NextResponse } from "next/server";
import { z } from "zod";
import { findShopifyOrder } from "@/lib/shopify";
import { getOrderByNumber, publicOrder, upsertShopifyOrder } from "@/lib/orders";
import { writeCustomerSession } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema=z.object({orderId:z.string().min(1).max(50),email:z.string().email()});
export async function POST(request:Request){try{const input=schema.parse(await request.json());await enforceRateLimit(request,"order_verify",input.orderId,10,600);let order=await getOrderByNumber(input.orderId);if(!order){const node=await findShopifyOrder(input.orderId);if(!node)return NextResponse.json({error:"Order not found"},{status:404});order=await upsertShopifyOrder(node)}if(order.email.toLowerCase()!==input.email.trim().toLowerCase())return NextResponse.json({error:"Email does not match this order"},{status:403});if(!["PAID","PARTIALLY_REFUNDED"].includes(order.financial_status))return NextResponse.json({error:"This order is not currently eligible for delivery"},{status:403});await writeCustomerSession({email:order.email,orderIds:[order.id],history:false},14);return NextResponse.json({order:publicOrder(order)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Verification failed"},{status:400})}}
