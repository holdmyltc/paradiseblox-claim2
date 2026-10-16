import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import type { AuditEvent } from "@/lib/types";

/** The order's activity log for the dashboard. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { orderId } = await params;
  const { data } = await supabaseAdmin().from("audit_events").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(300);
  const events: AuditEvent[] = (data || []).map((e: any) => ({
    id: e.id, actor: e.actor, action: e.action, ip: e.ip, country: e.country, region: e.region, city: e.city,
    userAgent: e.user_agent, details: e.details || {}, createdAt: e.created_at,
  }));
  return NextResponse.json({ events });
}
