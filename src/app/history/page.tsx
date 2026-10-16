import { Header } from "@/components/header";
import { HistoryClient } from "@/components/history-client";
import { readCustomerSession } from "@/lib/session";
import { listOrdersByEmail, publicOrder } from "@/lib/orders";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PublicOrder } from "@/lib/types";
import { demoAccountOrders } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const metadata = { title: "My orders | Paradise Blox" };

async function loadAccount(email: string): Promise<PublicOrder[]> {
  const rows = (await listOrdersByEmail(email)) as any[];
  const orders = rows.map((o) => publicOrder(o));
  if (!orders.length) return orders;
  // New messages from us that the customer hasn't read yet, per order.
  const { data } = await supabaseAdmin().from("messages").select("order_id")
    .in("order_id", orders.map((o) => o.id)).eq("sender", "admin").is("read_by_customer_at", null).limit(1000);
  const unread: Record<string, number> = {};
  for (const m of data || []) unread[m.order_id] = (unread[m.order_id] || 0) + 1;
  return orders.map((o) => ({ ...o, unreadCount: unread[o.id] || 0 }));
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (await searchParams).demo) {
    return <div className="app"><Header /><main className="page"><HistoryClient account={{ email: "you@example.com", orders: demoAccountOrders() }} /></main></div>;
  }
  const session = await readCustomerSession().catch(() => null);
  const loggedIn = Boolean(session?.history);
  const orders = loggedIn && session ? await loadAccount(session.email).catch(() => null) : null;
  return <div className="app"><Header /><main className={`page ${loggedIn ? "" : "page-narrow"}`}>
    <HistoryClient account={loggedIn && session && orders ? { email: session.email, orders } : null} />
  </main></div>;
}
