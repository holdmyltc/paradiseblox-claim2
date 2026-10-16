import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOrderById, publicOrder } from "@/lib/orders";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { addSystemMessage } from "@/lib/messages";
import { completeAsReceived } from "@/lib/lifecycle";
import { logEvent } from "@/lib/audit";
import { pushToAdmins } from "@/lib/push";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const { action } = z.object({ action: z.enum(["confirm", "not_yet"]) }).parse(await request.json());
    const order = await getOrderById(orderId);
    const session = await readCustomerSession();
    if (!order || !canAccessOrder(session, order.id, order.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (order.status !== "delivered") return NextResponse.json({ error: "This order isn't waiting for you to confirm" }, { status: 409 });

    if (action === "not_yet") {
      await logEvent(order.id, "customer", "not_yet", request);
      await addSystemMessage(order.id, "The customer tapped Not yet. ParadiseBlox will keep helping in this chat.");
      after(() => pushToAdmins({ title: `${order.order_number}: Not yet`, body: "The customer says something hasn't arrived.", url: `/admin?order=${order.id}`, tag: `notyet-${order.id}`, kind: "message" }));
      return NextResponse.json({ order: publicOrder(order) });
    }

    await completeAsReceived(order.id, "customer", request);
    return NextResponse.json({ order: publicOrder(await getOrderById(order.id)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Confirmation failed" }, { status: 400 });
  }
}
