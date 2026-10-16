import { supabaseAdmin } from "@/lib/supabase/server";
import { requestInfo } from "@/lib/request-info";

export type AuditActor = "customer" | "admin" | "system";

/**
 * Adds a line to the order's evidence log. Never throws: a logging hiccup must
 * not stop a customer from confirming or an admin from delivering.
 */
export async function logEvent(
  orderId: string | null,
  actor: AuditActor,
  action: string,
  request?: Request | null,
  details: Record<string, unknown> = {},
) {
  try {
    const info = requestInfo(request);
    await supabaseAdmin().from("audit_events").insert({
      order_id: orderId,
      actor,
      action,
      ip: info.ip,
      country: info.country,
      region: info.region,
      city: info.city,
      user_agent: info.userAgent,
      details,
    });
  } catch (error) {
    console.error("audit log failed", action, error);
  }
}

/** Logs a page view at most once per hour per order and actor, so the log stays readable. */
export async function logViewOnce(orderId: string, actor: AuditActor, request: Request) {
  try {
    const db = supabaseAdmin();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const info = requestInfo(request);
    let q = db.from("audit_events").select("id", { count: "exact", head: true })
      .eq("order_id", orderId).eq("actor", actor).eq("action", "order_viewed").gte("created_at", since);
    q = info.ip ? q.eq("ip", info.ip) : q.is("ip", null);
    const { count } = await q;
    if ((count || 0) > 0) return;
    await logEvent(orderId, actor, "order_viewed", request);
  } catch (error) {
    console.error("view log failed", error);
  }
}
