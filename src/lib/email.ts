import { SITE_URL } from "@/lib/config";

export type EmailAttachment = { filename: string; content: string };

export async function sendEmail(input: { to: string | string[]; subject: string; html: string; attachments?: EmailAttachment[] }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "ParadiseBlox <orders@paradiseblox.com>";
  if (!key) {
    console.log("[email preview]", { ...input, attachments: input.attachments?.map((a) => a.filename) });
    return { id: "development-preview" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, reply_to: process.env.REPLY_TO_EMAIL || "support@paradiseblox.com", ...input }),
  });
  if (!response.ok) throw new Error(`Email failed: ${await response.text()}`);
  return response.json();
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Dark email layout matching the store. Built with tables so it looks right in Gmail, Outlook and Apple Mail. */
export function emailFrame(content: string, preheader = "") {
  const logo = `${SITE_URL}/pb-wordmark.png`;
  return `<!doctype html><html><head><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:#0c0d12;font-family:Lato,Helvetica,Arial,sans-serif;color:#f2f4f8">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0d12"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:6px 0 22px"><img src="${logo}" alt="Paradise Blox" width="190" style="display:block;width:190px;height:auto;border:0"></td></tr>
<tr><td style="background:#181a22;border:1px solid #262a35;border-radius:16px;padding:30px 28px">${content}</td></tr>
<tr><td align="center" style="padding:20px 10px;color:#6f7788;font-size:12px;line-height:1.6">Paradise Blox. Questions? Just reply to this email.<br>We will never ask for your Roblox password.</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailButton(url: string, label: string, color = "#3b82f6") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:${color};border-radius:10px"><a href="${url}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-weight:bold;font-size:15px;text-decoration:none;border-radius:10px">${label}</a></td></tr></table>`;
}

export const H = (text: string) => `<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:#f2f4f8">${text}</h1>`;
export const P = (text: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#aab2c2">${text}</p>`;
export const SMALL = (text: string) => `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:#6f7788">${text}</p>`;

export async function sendClaimLinkEmail(email: string, orderNumber: string, token: string) {
  const url = `${SITE_URL}/claim/${token}`;
  return sendEmail({
    to: email,
    subject: `Your Paradise Blox order ${orderNumber} is ready`,
    html: emailFrame(
      H("Thanks for your order!") +
      P(`Open your order page to link your Roblox account and chat with us while we deliver order <strong style="color:#f2f4f8">${escapeHtml(orderNumber)}</strong>. Most orders are delivered in 1 to 20 minutes.`) +
      emailButton(url, "Open my order") +
      SMALL(`You can also go to ${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))} and enter your order number and checkout email.`),
      "Link your Roblox account and get your items.",
    ),
  });
}

export async function sendVerificationCodeEmail(email: string, code: string) {
  return sendEmail({
    to: email,
    subject: `${code} is your Paradise Blox verification code`,
    html: emailFrame(
      H("Your verification code") +
      P("Use this code to see all the orders linked to your email.") +
      `<div style="font-size:34px;font-weight:900;letter-spacing:8px;color:#60a5fa;padding:12px 0 6px">${code}</div>` +
      SMALL("The code expires in 10 minutes. Never share it with anyone."),
      `Your code is ${code}`,
    ),
  });
}
