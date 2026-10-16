import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/config";
import { createOrderLinkToken } from "@/lib/link-token";
import { emailButton, emailFrame, escapeHtml, H, P, sendEmail, SMALL } from "@/lib/email";

/** Wait this long before emailing about an unread message, so a quick chat doesn't send a pile of emails. */
export const NOTIFY_DELAY_MINUTES = 2;
/** Never email the same person about the same order more often than this. */
export const NOTIFY_GAP_MINUTES = 10;

async function adminEmails() {
  const db = supabaseAdmin();
  const { data: admins } = await db.from("admin_profiles").select("user_id");
  const emails: string[] = [];
  for (const a of admins || []) {
    const { data } = await db.auth.admin.getUserById(a.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return [...new Set(emails)];
}

/** Customers: one email per order when ParadiseBlox has written and they haven't read it yet. */
export async function notifyCustomersOfUnread() {
  const db = supabaseAdmin();
  const olderThan = new Date(Date.now() - NOTIFY_DELAY_MINUTES * 60_000).toISOString();
  const { data: msgs } = await db.from("messages").select("order_id,created_at")
    .eq("sender", "admin").is("read_by_customer_at", null).lte("created_at", olderThan)
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order("created_at", { ascending: false }).limit(500);
  const latest = new Map<string, string>();
  for (const m of msgs || []) if (!latest.has(m.order_id)) latest.set(m.order_id, m.created_at);
  let sent = 0;
  for (const [orderId, newest] of latest) {
    const { data: order } = await db.from("orders").select("id,email,order_number,status,customer_notified_at").eq("id", orderId).maybeSingle();
    if (!order || order.status === "cancelled") continue;
    const last = order.customer_notified_at ? new Date(order.customer_notified_at).getTime() : 0;
    if (last >= new Date(newest).getTime()) continue;
    if (Date.now() - last < NOTIFY_GAP_MINUTES * 60_000) continue;
    // Claim the slot first so two runs at once can't both send.
    const { data: claimed } = await db.from("orders").update({ customer_notified_at: new Date().toISOString() })
      .eq("id", orderId).filter("customer_notified_at", order.customer_notified_at ? "eq" : "is", order.customer_notified_at ?? null).select("id");
    if (!claimed?.length) continue;
    const url = `${SITE_URL}/o/${createOrderLinkToken(orderId, 30)}`;
    try {
      await sendEmail({
        to: order.email,
        subject: `Paradise Blox sent you a message about ${order.order_number}`,
        html: emailFrame(
          H("You have a new message") +
          P(`We've replied about your order <strong style="color:#f2f4f8">${escapeHtml(order.order_number)}</strong>. Open the chat to keep things moving.`) +
          emailButton(url, "Reply now") +
          SMALL("We will never ask for your Roblox password in the chat or anywhere else."),
          "Reply to keep things moving.",
        ),
      });
      sent++;
    } catch (e) {
      console.error("customer notify failed", orderId, e);
    }
  }
  return sent;
}

/** You: an email when a customer has been waiting on an unread message. */
export async function notifyAdminOfUnread() {
  const db = supabaseAdmin();
  const olderThan = new Date(Date.now() - NOTIFY_DELAY_MINUTES * 60_000).toISOString();
  const { data: msgs } = await db.from("messages").select("order_id,created_at,body")
    .eq("sender", "customer").is("read_by_admin_at", null).lte("created_at", olderThan)
    .gte("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .order("created_at", { ascending: false }).limit(500);
  const latest = new Map<string, { at: string; body: string }>();
  for (const m of msgs || []) if (!latest.has(m.order_id)) latest.set(m.order_id, { at: m.created_at, body: m.body });
  const due: Array<{ id: string; number: string; body: string }> = [];
  for (const [orderId, info] of latest) {
    const { data: order } = await db.from("orders").select("id,order_number,status,admin_notified_at").eq("id", orderId).maybeSingle();
    if (!order || order.status === "cancelled") continue;
    const last = order.admin_notified_at ? new Date(order.admin_notified_at).getTime() : 0;
    if (last >= new Date(info.at).getTime()) continue;
    if (Date.now() - last < NOTIFY_GAP_MINUTES * 60_000) continue;
    const { data: claimed } = await db.from("orders").update({ admin_notified_at: new Date().toISOString() })
      .eq("id", orderId).filter("admin_notified_at", order.admin_notified_at ? "eq" : "is", order.admin_notified_at ?? null).select("id");
    if (claimed?.length) due.push({ id: orderId, number: order.order_number, body: info.body });
  }
  if (!due.length) return 0;
  const to = await adminEmails();
  if (!to.length) return 0;
  const rows = due.map((d) => `<tr><td style="padding:10px 0;border-bottom:1px solid #262a35"><a href="${SITE_URL}/admin?order=${d.id}" style="color:#60a5fa;font-weight:bold;text-decoration:none">${escapeHtml(d.number)}</a><div style="color:#aab2c2;font-size:13px;margin-top:3px">${escapeHtml((d.body || "Sent an image").slice(0, 140))}</div></td></tr>`).join("");
  await sendEmail({
    to,
    subject: due.length === 1 ? `New message on ${due[0].number}` : `${due.length} orders have new messages`,
    html: emailFrame(H(due.length === 1 ? "A customer is waiting on you" : `${due.length} customers are waiting on you`) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` + emailButton(`${SITE_URL}/admin`, "Open dashboard")),
  }).catch((e) => console.error("admin notify failed", e));
  return due.length;
}

/** You: an email the moment a new order is paid. High risk orders say so in the subject. */
export async function emailAdminNewOrder(order: { id: string; order_number: string; total_amount: number | string; currency: string; risk_level?: string | null; risk_hold?: boolean }) {
  const to = await adminEmails();
  if (!to.length) return;
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency || "USD" }).format(Number(order.total_amount) || 0);
  const flag = order.risk_hold ? "ON HOLD, high risk: " : order.risk_level === "medium" ? "Check this one: " : "";
  await sendEmail({
    to,
    subject: `${flag}New order ${order.order_number} (${money})`,
    html: emailFrame(
      H(order.risk_hold ? "New order on hold" : "New order") +
      P(`${escapeHtml(order.order_number)} was paid for ${money}.${order.risk_hold ? " It was flagged high risk, so it's on hold until you approve it." : order.risk_level === "medium" ? " It has a medium risk warning, have a look before you deliver." : ""}`) +
      emailButton(`${SITE_URL}/admin?order=${order.id}`, "Open order"),
    ),
  });
}
