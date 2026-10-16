import { NextResponse } from "next/server";
import { getOrderById, publicOrder } from "@/lib/orders";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { requireAdmin } from "@/lib/supabase/server";
import { getProofs } from "@/lib/messages";
import { autoReceiveIfDue } from "@/lib/lifecycle";
import { logViewOnce } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let order = await getOrderById(orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const admin = await requireAdmin(request);
  const session = admin ? null : await readCustomerSession();
  if (!admin && !canAccessOrder(session, order.id, order.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  if (await autoReceiveIfDue(order).catch(() => false)) order = (await getOrderById(orderId)) ?? order;
  if (!admin && new URL(request.url).searchParams.get("view") === "1") void logViewOnce(order.id, "customer", request);

  return NextResponse.json({ order: publicOrder(order, { admin: Boolean(admin) }), proofs: await getProofs(order.id) });
}
