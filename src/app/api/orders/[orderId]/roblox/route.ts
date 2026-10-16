import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOrderById, publicOrder } from "@/lib/orders";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addSystemMessage } from "@/lib/messages";
import { lookupRobloxUser } from "@/lib/roblox";
import { logEvent } from "@/lib/audit";
import { assessClaimRisk } from "@/lib/risk";
import { requestInfo } from "@/lib/request-info";
import { pushToAdmins } from "@/lib/push";

const schema = z.object({ username: z.string().min(3).max(20), consent: z.literal(true) });

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const order = await getOrderById(orderId);
    const session = await readCustomerSession();
    if (!order || !canAccessOrder(session, order.id, order.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (order.roblox_user_id) return NextResponse.json({ error: "A Roblox account is already linked to this order" }, { status: 409 });
    if (order.status === "cancelled") return NextResponse.json({ error: "This order was cancelled" }, { status: 409 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Tick the box to confirm this is your account" }, { status: 400 });

    // Look the account up again on the server, so the saved details always come from Roblox itself.
    const profile = await lookupRobloxUser(parsed.data.username);
    const now = new Date().toISOString();
    await supabaseAdmin().from("orders").update({
      roblox_user_id: profile.userId,
      roblox_username: profile.username,
      roblox_display_name: profile.displayName,
      roblox_avatar_url: profile.avatarUrl,
      consent_at: now,
      status: order.status === "paid" ? "in_progress" : order.status,
      updated_at: now,
    }).eq("id", order.id);

    await logEvent(order.id, "customer", "roblox_confirmed", request, { robloxUserId: profile.userId, username: profile.username, displayName: profile.displayName });
    await addSystemMessage(order.id, `Roblox account @${profile.username} was linked to this order.`);
    const country = requestInfo(request).country;
    after(async () => {
      await assessClaimRisk(order.id, country);
      await pushToAdmins({ title: `${order.order_number} claimed`, body: `@${profile.username} is ready for delivery`, url: `/admin?order=${order.id}`, tag: `claim-${order.id}`, kind: "order" });
    });

    const updated = await getOrderById(order.id);
    return NextResponse.json({ order: publicOrder(updated) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save account" }, { status: 400 });
  }
}
