import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/server";
import { getOrderById } from "@/lib/orders";
import { sendCompletionReceipt } from "@/lib/receipt";
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order || order.status !== "completed") return NextResponse.json({ error: "Only completed orders have a completion receipt" }, { status: 409 });
  try { await sendCompletionReceipt(order); return NextResponse.json({ success: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Receipt failed" }, { status: 500 }); }
}
