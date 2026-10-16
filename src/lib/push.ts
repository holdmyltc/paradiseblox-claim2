import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Phone and desktop alerts for the admin. Quietly does nothing until the VAPID keys are added. */
let configured: boolean | null = null;
function ready() {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { configured = false; return false; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@paradiseblox.com", pub, priv);
  configured = true;
  return true;
}

export function pushEnabled() {
  return ready();
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string; kind?: "order" | "message" | "risk" | "info" };

export async function pushToAdmins(payload: PushPayload) {
  if (!ready()) return;
  const db = supabaseAdmin();
  const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth");
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: "high" },
      );
      await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
    } catch (error: any) {
      // 404 / 410 mean the phone or browser removed the subscription
      if (error?.statusCode === 404 || error?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", error?.statusCode, error?.body || error);
    }
  }));
}
