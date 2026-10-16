import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { pushEnabled, pushToAdmins } from "@/lib/push";

const sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ enabled: pushEnabled(), publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null });
}

/** Saves this phone or browser for alerts, then sends a test alert. */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!pushEnabled()) return NextResponse.json({ error: "Phone alerts aren't set up yet. Add the VAPID keys in Vercel." }, { status: 409 });
  try {
    const s = sub.parse(await request.json());
    await supabaseAdmin().from("push_subscriptions").upsert({
      user_id: admin.user.id,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) || null,
    }, { onConflict: "endpoint" });
    await pushToAdmins({ title: "Alerts are on", body: "You'll get new orders and messages here.", url: "/admin", tag: "test", kind: "info" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not turn on alerts" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await request.json());
  await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
