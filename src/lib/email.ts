import { SITE_URL } from "@/lib/config";

export type EmailAttachment = { filename: string; content: string };

export async function sendEmail(input: { to: string; subject: string; html: string; attachments?: EmailAttachment[] }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "ParadiseBlox <orders@paradiseblox.com>";
  if (!key) {
    console.log("[email preview]", { ...input, attachments: input.attachments?.map((a) => a.filename) });
    return { id: "development-preview" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...input }),
  });
  if (!response.ok) throw new Error(`Email failed: ${await response.text()}`);
  return response.json();
}

export function emailFrame(content: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#17213b"><div style="max-width:620px;margin:0 auto;padding:30px 16px"><div style="background:white;border-radius:18px;padding:28px;border:1px solid #e7eaf0"><h1 style="margin:0 0 18px;font-size:28px"><span style="color:#ff6b1a">PARADISE</span><span style="color:#2563eb"> BLOX</span></h1>${content}</div><p style="text-align:center;color:#98a2b3;font-size:11px;margin:18px 0">ParadiseBlox secure delivery centre</p></div></body></html>`;
}

export async function sendClaimLinkEmail(email: string, orderNumber: string, token: string) {
  const url = `${SITE_URL}/claim/${token}`;
  return sendEmail({
    to: email,
    subject: `Claim your ParadiseBlox order ${orderNumber}`,
    html: emailFrame(`<h2 style="margin:0 0 10px">Your order is ready to claim</h2><p style="color:#667085;line-height:1.7">Open the secure delivery page, verify your Roblox username and chat with ParadiseBlox while we deliver your items.</p><a href="${url}" style="display:inline-block;margin-top:10px;background:#ff6b1a;color:white;text-decoration:none;padding:13px 20px;border-radius:11px;font-weight:bold">Start your delivery</a><p style="font-size:12px;color:#98a2b3;margin-top:18px">You can also visit claim2.paradiseblox.com and use your order ID and checkout email.</p>`),
  });
}

export async function sendVerificationCodeEmail(email: string, code: string) {
  return sendEmail({
    to: email,
    subject: `${code} is your ParadiseBlox verification code`,
    html: emailFrame(`<h2 style="margin:0">Verify your email</h2><p style="color:#667085">Use this code to view all active and previous orders connected to your email.</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#2563eb;padding:18px 0">${code}</div><p style="font-size:12px;color:#98a2b3">The code expires in 10 minutes. Do not share it.</p>`),
  });
}
