import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { publicOrder } from "@/lib/orders";
import { autoReceiveOverdue } from "@/lib/lifecycle";

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "active";
  // strip characters that would break the PostgREST or() filter
  const search = (url.searchParams.get("q") || "").replace(/[,()%*\\"']/g, " ").trim().slice(0, 60);
  const db = supabaseAdmin();
  // Finish any delivered orders that passed 24 hours, so the list is always current.
  await autoReceiveOverdue(10).catch((e) => console.error("auto receive in list failed", e));

  // Query 1: orders plus their items in one round trip
  let q = db.from("orders").select("*, order_items(*)").order("updated_at", { ascending: false }).limit(200);
  if (search) {
    q = q.or(
      `order_number.ilike.%${search}%,email.ilike.%${search}%,roblox_username.ilike.%${search}%,roblox_display_name.ilike.%${search}%`
    );
  } else if (filter === "active") q = q.in("status", ["paid", "in_progress", "delivered"]);
  else if (filter === "hold") q = q.eq("risk_hold", true).neq("status", "cancelled");
  else if (filter === "risk") q = q.in("risk_level", ["medium", "high"]).neq("status", "cancelled");
  else if (filter === "unclaimed") q = q.eq("status", "paid");
  else if (filter !== "all") q = q.eq("status", filter);

  const [{ data: rows }, { data: setting }] = await Promise.all([
    q,
    db.from("store_settings").select("value").eq("key", "store_status").maybeSingle(),
  ]);
  const storeStatus = setting?.value === "online" ? "online" : "offline";
  const raw = rows || [];
  const ids = raw.map((o: any) => o.id);

  // Query 2: customer messages for those orders -> unread count + newest time
  const unread: Record<string, number> = {};
  const lastAt: Record<string, string> = {};
  if (ids.length) {
    const { data: msgs } = await db
      .from("messages")
      .select("order_id, created_at, read_by_admin_at")
      .in("order_id", ids)
      .eq("sender", "customer")
      .order("created_at", { ascending: false })
      .limit(3000);
    for (const m of msgs || []) {
      if (!lastAt[m.order_id]) lastAt[m.order_id] = m.created_at;
      if (!m.read_by_admin_at) unread[m.order_id] = (unread[m.order_id] || 0) + 1;
    }
  }

  const orders = raw.map((o: any) => {
    const { order_items, ...rest } = o;
    return {
      ...publicOrder({ ...rest, items: [...(order_items || [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at))), store_status: storeStatus }, { admin: true }),
      unreadCount: unread[o.id] || 0,
      lastCustomerMessageAt: lastAt[o.id] || null,
    };
  });

  return NextResponse.json({ orders, storeStatus });
}
