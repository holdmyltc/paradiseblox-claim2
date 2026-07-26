import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getMessages, getProofs } from "@/lib/messages";
import { sendEmail, emailFrame } from "@/lib/email";
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
  draw("PARADISE BLOX", 22, true, rgb(.1,.29,.7));
  draw("Delivery Receipt", 17, true);
  y -= 5;
  draw(`Order: ${order.order_number}`, 11, true);
  draw(`Customer email: ${order.email}`);
  draw(`Roblox account: ${order.roblox_username || "Not recorded"} (User ID: ${order.roblox_user_id || "N/A"})`);
  draw(`Status: ${order.status}`);
  draw(`Delivered: ${order.delivered_at || "N/A"}`);
  draw(`Completed: ${order.completed_at || "N/A"} by ${order.completed_by || "N/A"}`);
  y -= 10;
  draw("ITEMS DELIVERED", 12, true, rgb(.9,.29,0));
  for (const item of order.items || []) draw(`${item.quantity}x ${item.name}, ${item.game}`);
  y -= 10;
  draw("CHAT TRANSCRIPT", 12, true, rgb(.9,.29,0));
  for (const message of messages) draw(`[${new Date(message.createdAt).toLocaleString("en-US")}] ${message.sender.toUpperCase()}: ${message.body}${message.attachmentName ? ` [Attachment: ${message.attachmentName}]` : ""}`, 9);
  y -= 10;
  draw("DELIVERY PROOF", 12, true, rgb(.9,.29,0));
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
    subject: `ParadiseBlox delivery receipt ${order.order_number}`,
    html: emailFrame(`<h2 style="margin:0 0 8px">Your order is complete</h2><p style="color:#667085;line-height:1.7">Your items were delivered to <strong>${order.roblox_username || "your verified Roblox account"}</strong>. A copy of the chat transcript and delivery record is attached.</p><p><a href="${viewUrl}" style="color:#2563eb;font-weight:bold">View your read-only order record</a></p><a href="${TRUSTPILOT_URL}" style="display:inline-block;margin-top:8px;background:#00b67a;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">Review ParadiseBlox on Trustpilot</a>`),
    attachments: [{ filename: `ParadiseBlox-${order.order_number.replace("#", "")}-receipt.pdf`, content: pdf.toString("base64") }],
    });
    await supabaseAdmin().from("email_receipts").insert({ order_id: order.id, receipt_type: "completion", status: "sent", provider_id: sent?.id || null });
  } catch (error) {
    await supabaseAdmin().from("email_receipts").insert({ order_id: order.id, receipt_type: "completion", status: "failed", error: error instanceof Error ? error.message : "Unknown email error" });
    throw error;
  }
}
