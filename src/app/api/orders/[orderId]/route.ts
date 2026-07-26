import { NextResponse } from "next/server";
import { getOrderById, publicOrder } from "@/lib/orders";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { requireAdmin } from "@/lib/supabase/server";
import { getProofs } from "@/lib/messages";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const admin = await requireAdmin(request);
  const session = admin ? null : await readCustomerSession();
  if (!admin && !canAccessOrder(session, order.id, order.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ order: publicOrder(order), proofs: await getProofs(order.id) });
}
