import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getMessageRows } from "@/lib/messages";
import { downloadFile } from "@/lib/storage";
import { CONSENT_TEXT } from "@/lib/copy";

/**
 * Builds the chargeback evidence PDF for one order: order and payment facts,
 * the verified Roblox account, the customer's agreement, every logged action
 * with time, IP, location and device, the full chat, and every screenshot.
 */

const ACTION_LABEL: Record<string, string> = {
  claim_link_opened: "Opened the order using the link emailed to the checkout email",
  order_link_opened: "Opened the order from a notification email",
  order_verified: "Opened the order with the order number and checkout email",
  history_opened: "Viewed their order history after entering an emailed code",
  order_viewed: "Viewed the order page",
  roblox_confirmed: "Confirmed their Roblox account and ticked the agreement",
  message_sent: "Sent a chat message",
  card_number_blocked: "Tried to send a card number (blocked, not stored)",
  received_confirmed: "Tapped Received: confirmed they got everything",
  not_yet: "Tapped Not yet",
  auto_received: "Marked received automatically 24 hours after delivery",
  admin_started: "ParadiseBlox started the delivery",
  admin_delivered: "ParadiseBlox marked the order delivered",
  admin_completed: "ParadiseBlox completed the order",
  admin_cancelled: "ParadiseBlox cancelled the order",
  admin_reopened: "ParadiseBlox reopened the order",
  admin_item_update: "ParadiseBlox updated an item's delivery status",
  admin_message: "ParadiseBlox sent a chat message",
  admin_proof_uploaded: "ParadiseBlox uploaded delivery proof",
  risk_flagged: "Order flagged by the risk check",
  risk_approved: "ParadiseBlox approved the order after review",
  risk_cancelled: "ParadiseBlox cancelled the order after review",
  chat_locked: "ParadiseBlox closed the chat",
  chat_unlocked: "ParadiseBlox reopened the chat",
};

const ACTOR: Record<string, string> = { customer: "Customer", admin: "ParadiseBlox", system: "System" };

function safe(text: unknown) {
  return String(text ?? "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\r/g, "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n\xA0-\xFF]/g, "?");
}

function when(iso: string | null | undefined) {
  if (!iso) return "N/A";
  const d = new Date(iso);
  const utc = d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const syd = d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "medium" });
  return `${utc} (${syd} Sydney)`;
}

export function deviceSummary(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${os}, ${browser}`;
}

class Writer {
  pdf: PDFDocument;
  page!: PDFPage;
  y = 0;
  regular!: PDFFont;
  bold!: PDFFont;
  readonly left = 44;
  readonly width = 595 - 88;
  constructor(pdf: PDFDocument) { this.pdf = pdf; }
  async init() {
    this.regular = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.bold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage([595, 842]);
    this.y = 800;
  }
  ensure(space: number) {
    if (this.y - space < 50) this.newPage();
  }
  lines(text: string, size: number, font: PDFFont, maxWidth = this.width) {
    const out: string[] = [];
    for (const para of safe(text).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxWidth) {
          if (line) out.push(line);
          // break very long words (links, codes)
          let w = word;
          while (font.widthOfTextAtSize(w, size) > maxWidth) {
            let cut = w.length;
            while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
            out.push(w.slice(0, cut));
            w = w.slice(cut);
          }
          line = w;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  }
  text(text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const color = opts.color ? rgb(...opts.color) : rgb(0.15, 0.17, 0.22);
    for (const line of this.lines(text, size, font)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: this.left, y: this.y, size, font, color });
      this.y -= size + 4;
    }
    this.y -= opts.gap ?? 0;
  }
  heading(text: string) {
    this.ensure(40);
    this.y -= 8;
    this.page.drawRectangle({ x: this.left, y: this.y - 4, width: this.width, height: 20, color: rgb(0.93, 0.95, 0.99) });
    this.page.drawText(safe(text).toUpperCase(), { x: this.left + 8, y: this.y + 2, size: 10, font: this.bold, color: rgb(0.11, 0.3, 0.75) });
    this.y -= 26;
  }
  row(label: string, value: string) {
    const size = 9.5;
    const labelWidth = 150;
    const valueLines = this.lines(value || "N/A", size, this.regular, this.width - labelWidth);
    this.ensure((size + 4) * valueLines.length);
    this.page.drawText(safe(label), { x: this.left, y: this.y, size, font: this.bold, color: rgb(0.35, 0.38, 0.45) });
    for (const line of valueLines) {
      this.page.drawText(line, { x: this.left + labelWidth, y: this.y, size, font: this.regular, color: rgb(0.12, 0.14, 0.2) });
      this.y -= size + 4;
    }
    this.y -= 2;
  }
  async image(bytes: Buffer, mime: string, caption: string) {
    try {
      const img = mime === "image/png" ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
      const maxW = this.width;
      const maxH = 560;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      this.ensure(h + 30);
      this.text(caption, { size: 8.5, color: [0.35, 0.38, 0.45] });
      this.page.drawImage(img, { x: this.left, y: this.y - h, width: w, height: h });
      this.y -= h + 14;
    } catch {
      this.text(`${caption} (image could not be embedded)`, { size: 8.5, color: [0.6, 0.2, 0.2] });
    }
  }
}

async function fetchImage(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());
    if (type.includes("png")) return { buf, mime: "image/png" };
    if (type.includes("jpeg") || type.includes("jpg")) return { buf, mime: "image/jpeg" };
    return null;
  } catch {
    return null;
  }
}

export async function buildEvidencePdf(orderId: string) {
  const db = supabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
  const [{ data: items }, { data: events }, { data: proofs }, messages] = await Promise.all([
    db.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
    db.from("audit_events").select("*").eq("order_id", orderId).order("created_at"),
    db.from("delivery_proofs").select("*").eq("order_id", orderId).order("created_at"),
    getMessageRows(orderId),
  ]);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Paradise Blox evidence ${order.order_number}`);
  pdf.setAuthor("Paradise Blox");
  const w = new Writer(pdf);
  await w.init();

  w.text("PARADISE BLOX", { size: 20, bold: true, color: [0.11, 0.3, 0.75] });
  w.text("Order delivery and evidence record", { size: 14, bold: true, gap: 2 });
  w.text(`Generated ${when(new Date().toISOString())}. Created automatically from the Paradise Blox delivery system. All times are recorded by the server.`, { size: 8.5, color: [0.4, 0.43, 0.5], gap: 6 });

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency || "USD" }).format(Number(order.total_amount) || 0);
  w.heading("Order and payment");
  w.row("Order number", order.order_number);
  w.row("Shopify order ID", order.shopify_order_gid);
  w.row("Paid", when(order.shopify_created_at || order.created_at));
  w.row("Total", `${money} (${order.financial_status})`);
  w.row("Checkout email", order.email);
  w.row("IP used at checkout", order.checkout_ip || "Not recorded by Shopify");
  w.row("Card billing country", order.billing_country || "Not recorded");
  w.row("Customer's previous orders", order.customer_order_count != null ? String(order.customer_order_count) : "Unknown");
  w.row("Risk check", `${order.risk_level ? order.risk_level.toUpperCase() : "Not checked"}${order.risk_decision ? `, ${order.risk_decision} by ParadiseBlox ${when(order.risk_decided_at)}` : ""}`);
  const reasons: string[] = Array.isArray(order.risk_reasons) ? order.risk_reasons : [];
  if (reasons.length) w.row("Risk notes", reasons.join("\n"));

  w.heading("Delivery");
  w.row("Status", String(order.status).replace("_", " "));
  w.row("Roblox account", order.roblox_user_id ? `${order.roblox_display_name || order.roblox_username} (@${order.roblox_username}), Roblox user ID ${order.roblox_user_id}` : "Not linked");
  w.row("Profile", order.roblox_user_id ? `https://www.roblox.com/users/${order.roblox_user_id}/profile` : "N/A");
  const consent = (events || []).find((e: any) => e.action === "roblox_confirmed");
  w.row("Customer agreement", order.consent_at
    ? `Ticked "${CONSENT_TEXT}" on ${when(order.consent_at)}${consent ? ` from IP ${consent.ip || "unknown"}${consent.country ? ` (${[consent.city, consent.region, consent.country].filter(Boolean).join(", ")})` : ""}, ${deviceSummary(consent.user_agent)}` : ""}`
    : "Not recorded (order claimed before this was added)");
  w.row("Marked delivered", when(order.delivered_at));
  w.row("Received", order.received_at ? `${when(order.received_at)}${order.completed_by === "auto" ? ", automatically after 24 hours with no problem reported" : order.completed_by === "customer" ? ", confirmed by the customer" : ""}` : "N/A");
  w.row("Completed", `${when(order.completed_at)}${order.completed_by ? ` by ${order.completed_by === "auto" ? "the system" : order.completed_by === "admin" ? "ParadiseBlox" : "the customer"}` : ""}`);

  if (order.roblox_avatar_url) {
    const avatar = await fetchImage(order.roblox_avatar_url);
    if (avatar) await w.image(avatar.buf, avatar.mime, `Roblox avatar of @${order.roblox_username}`);
  }

  w.heading("Items");
  for (const item of items || []) {
    const status = item.delivery_status === "delivered" ? "Delivered" : item.delivery_status === "missing" ? "Not delivered (refund)" : "Pending";
    w.row(`${item.quantity}x`, `${item.name}${item.variant_title ? ` (${item.variant_title})` : ""}, ${item.game}. ${status}${item.delivery_updated_at ? ` at ${when(item.delivery_updated_at)}` : ""}`);
  }

  w.heading("Activity log");
  if (!(events || []).length) w.text("No activity recorded (order handled before logging was added).", { size: 9 });
  for (const e of events || []) {
    const where = [e.city, e.region, e.country].filter(Boolean).join(", ");
    const extra = e.details && Object.keys(e.details).length ? ` ${JSON.stringify(e.details)}` : "";
    w.text(`${when(e.created_at)}  ${ACTOR[e.actor] || e.actor}: ${ACTION_LABEL[e.action] || e.action}${extra}`, { size: 9, bold: true });
    if (e.actor !== "system") w.text(`IP ${e.ip || "unknown"}${where ? `, ${where}` : ""}, ${deviceSummary(e.user_agent)}`, { size: 8.5, color: [0.4, 0.43, 0.5], gap: 3 });
  }

  w.heading("Chat transcript");
  const images: Array<{ path: string; mime: string; caption: string; bucket: string }> = [];
  for (const m of messages) {
    const who = m.sender === "customer" ? `Customer (@${order.roblox_username || "unlinked"})` : m.sender === "admin" ? "ParadiseBlox" : "System";
    const list: Array<{ path: string; name: string; mime: string }> = Array.isArray(m.attachments) && m.attachments.length ? m.attachments : m.attachment_path ? [{ path: m.attachment_path, name: m.attachment_name, mime: m.attachment_mime }] : [];
    const att = list.length ? ` [${list.length} screenshot${list.length === 1 ? "" : "s"}, see below]` : "";
    w.text(`${when(m.created_at)}  ${who}`, { size: 8.5, bold: true, color: [0.35, 0.38, 0.45] });
    w.text(`${m.body || ""}${att}`, { size: 9.5, gap: 4 });
    list.forEach((a, i) => images.push({ path: a.path, mime: a.mime, bucket: "chat-attachments", caption: `${who}, ${when(m.created_at)}, screenshot ${i + 1} of ${list.length}` }));
  }
  for (const p of proofs || []) images.push({ path: p.file_path, mime: p.mime_type, bucket: "delivery-proofs", caption: `Delivery proof uploaded by ParadiseBlox, ${when(p.created_at)}${p.note ? `: ${p.note}` : ""}` });

  if (images.length) {
    w.heading("Screenshots");
    for (const img of images) {
      if (img.mime !== "image/png" && img.mime !== "image/jpeg") { w.text(`${img.caption} (${img.mime || "file"}, not an image)`, { size: 8.5 }); continue; }
      const bytes = await downloadFile(img.bucket, img.path);
      if (bytes) await w.image(bytes, img.mime, img.caption);
      else w.text(`${img.caption} (file no longer available)`, { size: 8.5 });
    }
  }

  return Buffer.from(await pdf.save());
}
