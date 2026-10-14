import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { publicOrder } from "@/lib/orders";

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const filter = new URL(request.url).searchParams.get("filter") || "active";
  const db = supabaseAdmin();

  // One query for orders, their items, and their unread customer messages
  let q = db
    .from("orders")
    .select("*, order_items(*), messages(id)")
    .eq("messages.sender", "customer")
    .is("messages.read_by_admin_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filter === "active") q = q.in("status", ["paid", "in_progress", "delivered"]);
  else if (filter !== "all") q = q.eq("status", filter);

  const [{ data, error }, { data: setting }] = await Promise.all([
    q,
    db.from("store_settings").select("value").eq("key", "store_status").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const storeStatus = setting?.value || "offline";

  const orders = (data || []).map((row: any) => {
    const { order_items, messages, ...order } = row;
    const items = [...(order_items || [])].sort((a: any, b: any) =>
      String(a.created_at).localeCompare(String(b.created_at))
    );
    return {
      ...publicOrder({ ...order, items, store_status: storeStatus }),
      unreadCount: (messages || []).length,
      email: order.email,
    };
  });

  return NextResponse.json({ orders, storeStatus });
}
