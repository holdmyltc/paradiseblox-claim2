import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { OrderPageClient } from "@/components/order-page-client";
import { getOrderById, getOrderByNumber, publicOrder } from "@/lib/orders";
import { readCustomerSession, canAccessOrder } from "@/lib/session";
import { getMessages, getProofs } from "@/lib/messages";
import { DEMO_MESSAGES, DEMO_PROOFS, demoOrder } from "@/lib/demo";
import { autoReceiveIfDue } from "@/lib/lifecycle";
import { SUPPORT_EMAIL } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ state?: string }> }) {
  const { orderNumber } = await params;
  if (orderNumber === "demo" && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const demo = demoOrder((await searchParams).state);
    return <div className="app"><Header account={demo.roblox} /><main className="page"><OrderPageClient initialOrder={demo} initialMessages={demo.roblox ? DEMO_MESSAGES : []} initialProofs={DEMO_PROOFS} /></main></div>;
  }
  let order = await getOrderByNumber(orderNumber);
  if (!order) notFound();
  const session = await readCustomerSession();
  if (!canAccessOrder(session, order.id, order.email)) redirect("/");

  if (order.status === "cancelled") {
    return <div className="app"><Header /><main className="page page-narrow">
      <section className="panel empty-panel">
        <h1 className="status-title">Order {order.order_number} was cancelled</h1>
        <p className="status-text">{order.admin_completion_reason ? `Reason: ${order.admin_completion_reason}. ` : ""}Any refund goes back to your original payment method. If you think this is a mistake, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number.</p>
        <Link className="btn btn-ghost" href="/history">See my other orders</Link>
      </section>
    </main></div>;
  }

  if (await autoReceiveIfDue(order).catch(() => false)) order = (await getOrderById(order.id)) ?? order;
  const [messages, proofs] = await Promise.all([getMessages(order.id), getProofs(order.id)]);
  const data = publicOrder(order);
  return <div className="app"><Header account={data.roblox} /><main className="page"><OrderPageClient initialOrder={data} initialMessages={messages} initialProofs={proofs} /></main></div>;
}
