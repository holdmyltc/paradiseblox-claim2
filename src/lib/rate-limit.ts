import { hmacHex } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

function clientIp(request: Request) {
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function enforceRateLimit(request: Request, action: string, subject: string, max: number, windowSeconds: number) {
  const secret = process.env.CUSTOMER_SESSION_SECRET || "development-rate-secret";
  const keyHash = hmacHex(`${action}:${clientIp(request)}:${subject.toLowerCase()}`, secret);
  const db = supabaseAdmin();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count } = await db.from("request_events").select("id", { count: "exact", head: true }).eq("action", action).eq("key_hash", keyHash).gte("created_at", since);
  if ((count || 0) >= max) throw new Error("Too many attempts. Please wait and try again.");
  await db.from("request_events").insert({ action, key_hash: keyHash });
}
