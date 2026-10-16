import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getMessages, getProofs } from "@/lib/messages";
import { sendEmail, emailFrame, emailButton, escapeHtml, H, P, SMALL } from "@/lib/email";
import { TRUSTPILOT_URL, SITE_URL } from "@/lib/config";
import { randomToken, sha256 } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

function pdfSafe(text: string) {
  return text
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, max = 85) {
  const words = pdfSafe(text).replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > max) { lines.push(current); current = word; }
    else current = (current + " " + word).trim();
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildReceiptPdf(order: any) {
  const [messages, proofs] = await Promise.all([getMessages(order.id), getProofs(order.id)]);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const draw = (text: string, size = 10, isBold = false, color = rgb(.18,.22,.32)) => {
    for (const line of wrap(text, size > 14 ? 55 : 88)) {
      if (y < 48) { page = pdf.addPage([595,842]); y = 800; }
      page.drawText(line, { x: 42, y, size, font: isBold ? bold : regular, color });
      y -= size + 5;
    }
  };
  draw("PARADISE BLOX", 22, true, rgb(.11,.3,.75));
  draw("Delivery Receipt", 17, true);
  y -= 5;
  draw(`Order: ${order.order_number}`, 11, true);
  draw(`Customer email: ${order.email}`);
  draw(`Roblox account: ${order.roblox_username || "Not recorded"} (User ID: ${order.roblox_user_id || "N/A"})`);
  draw(`Status: ${order.status}`);
  draw(`Delivered: ${order.delivered_at || "N/A"}`);
  draw(`Completed: ${order.completed_at || "N/A"} by ${order.completed_by || "N/A"}`);
  y -= 10;
  draw("ITEMS", 12, true, rgb(.11,.3,.75));
  for (const item of order.items || []) draw(`${item.quantity}x ${item.name}${item.variant_title ? ` (${item.variant_title})` : ""}, ${item.game}${item.delivery_status === "missing" ? ", not delivered (refund)" : ""}`);
  y -= 10;
  draw("CHAT TRANSCRIPT", 12, true, rgb(.11,.3,.75));
  for (const message of messages) draw(`[${new Date(message.createdAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}] ${message.sender === "admin" ? "PARADISEBLOX" : message.sender.toUpperCase()}: ${message.body}${message.attachments.length ? ` [${message.attachments.length} screenshot${message.attachments.length === 1 ? "" : "s"}]` : ""}`, 9);
  y -= 10;
  draw("DELIVERY PROOF", 12, true, rgb(.11,.3,.75));
  if (!proofs.length) draw("No proof files were recorded.");
  for (const proof of proofs) draw(`${proof.fileName}${proof.note ? `, ${proof.note}` : ""}`);
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export async function sendCompletionReceipt(order: any) {
  const pdf = await buildReceiptPdf(order);
  const receiptToken = randomToken(32);
  await supabaseAdmin().from("orders").update({
    receipt_token_hash: sha256(receiptToken),
    receipt_token_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", order.id);
  const viewUrl = `${SITE_URL}/receipt/${receiptToken}`;
  try {
    const sent = await sendEmail({
    to: order.email,
    subject: `Your Paradise Blox order ${order.order_number} is complete`,
    html: emailFrame(
      H("Your order is complete") +
      P(`Your items were delivered to <strong style="color:#f2f4f8">${escapeHtml(order.roblox_username || "your Roblox account")}</strong>. Your chat and delivery record are attached and saved on your order page.`) +
      emailButton(viewUrl, "View my order") +
      `<div style="margin-top:26px;padding:18px;border-radius:12px;background:#12141a;border:1px solid #262a35"><p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#f2f4f8">How did we do?</p><p style="margin:0;font-size:14px;line-height:1.6;color:#aab2c2">If you have a minute, an honest review on Trustpilot really helps other players find us.</p>${emailButton(TRUSTPILOT_URL, "Write a review", "#00b67a")}</div>` +
      SMALL("Thanks for shopping with Paradise Blox."),
      "Your items were delivered. Thanks for shopping with us.",
    ),
    attachments: [{ filename: `ParadiseBlox-${order.order_number.replace("#", "")}-receipt.pdf`, content: pdf.toString("base64") }],
    });
    await supabaseAdmin().from("email_receipts").insert({ order_id: order.id, receipt_type: "completion", status: "sent", provider_id: sent?.id || null });
  } catch (error) {
    await supabaseAdmin().from("email_receipts").insert({ order_id: order.id, receipt_type: "completion", status: "failed", error: error instanceof Error ? error.message : "Unknown email error" });
    throw error;
  }
}
