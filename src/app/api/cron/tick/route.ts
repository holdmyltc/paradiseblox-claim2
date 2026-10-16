import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { autoReceiveOverdue } from "@/lib/lifecycle";
import { notifyAdminOfUnread, notifyCustomersOfUnread } from "@/lib/notify";
import { assessCheckoutRisk } from "@/lib/risk";
import { pushToAdmins } from "@/lib/push";
import { logEvent } from "@/lib/audit";

export const maxDuration = 60;

/** Keep chat screenshots and proof for this long, then delete them. */
const KEEP_FILES_DAYS = 120;

/**
 * Runs every couple of minutes from a Supabase scheduled job:
 *   - marks delivered orders received after 24 hours
 *   - re-checks orders Shopify was still assessing
 *   - emails customers and you about unread messages
 *   - once a day, deletes screenshots older than 120 days (chat text and the activity log are kept)
 */
async function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return safeEqual(header, `Bearer ${secret}`);
}

async function recheckPendingRisk() {
  const db = supabaseAdmin();
  const { data } = await db.from("orders").select("id,order_number,risk_hold").eq("risk_pending", true).limit(15);
  let held = 0;
  for (const row of data || []) {
    const result = await assessCheckoutRisk(row.id).catch((e) => { console.error("risk recheck failed", row.id, e); return null; });
    if (result?.newlyHeld) {
      held++;
      await logEvent(row.id, "system", "risk_flagged", null, { level: result.level, reasons: result.reasons });
      await pushToAdmins({ title: `${row.order_number} on hold`, body: "Flagged high risk by Shopify. Review before delivering.", url: `/admin?order=${row.id}`, tag: `risk-${row.id}`, kind: "risk" });
    }
  }
  return held;
}

async function retention() {
  const db = supabaseAdmin();
  const { data: last } = await db.from("store_settings").select("value").eq("key", "last_retention_run").maybeSingle();
  if (last?.value && Date.now() - new Date(last.value).getTime() < 23 * 3_600_000) return 0;
  await db.from("store_settings").upsert({ key: "last_retention_run", value: new Date().toISOString(), updated_at: new Date().toISOString() });
  const cutoff = new Date(Date.now() - KEEP_FILES_DAYS * 86_400_000).toISOString();
  let removed = 0;
  const { data: msgs } = await db.from("messages").select("id,attachments,attachment_path").lt("created_at", cutoff).or("attachment_path.not.is.null,attachments.cs.[{}]").limit(200);
  for (const m of msgs || []) {
    const paths = [...(Array.isArray(m.attachments) ? m.attachments.map((a: any) => a.path) : []), ...(m.attachment_path ? [m.attachment_path] : [])].filter(Boolean);
    if (paths.length) { await db.storage.from("chat-attachments").remove(paths); removed += paths.length; }
    await db.from("messages").update({ attachments: [], attachment_path: null }).eq("id", m.id);
  }
  const { data: proofs } = await db.from("delivery_proofs").select("id,file_path").lt("created_at", cutoff).limit(200);
  for (const p of proofs || []) {
    await db.storage.from("delivery-proofs").remove([p.file_path]);
    await db.from("delivery_proofs").delete().eq("id", p.id);
    removed++;
  }
  return removed;
}

async function run(request: Request) {
  if (!(await authorised(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result: Record<string, number | string> = {};
  const step = async (name: string, fn: () => Promise<number>) => {
    try { result[name] = await fn(); } catch (e) { console.error(`cron ${name} failed`, e); result[name] = "failed"; }
  };
  await step("autoReceived", () => autoReceiveOverdue(25));
  await step("riskHeld", recheckPendingRisk);
  await step("customerEmails", notifyCustomersOfUnread);
  await step("adminEmails", notifyAdminOfUnread);
  await step("filesRemoved", retention);
  return NextResponse.json({ ok: true, ...result });
}

export const POST = run;
export const GET = run;
