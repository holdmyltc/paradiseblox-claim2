// Sends a tiny "something changed" signal so open pages refresh right away.
// The signal carries no private data. If it fails, the normal refresh still works.
export async function pingOrder(orderId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [
          { topic: `order-${orderId}`, event: "ping", payload: {} },
          { topic: `order-${orderId}-state`, event: "ping", payload: {} },
          { topic: "admin-feed", event: "ping", payload: {} },
        ],
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) console.error("realtime ping failed", res.status, await res.text());
  } catch (e) {
    console.error("realtime ping error", e);
  }
}
