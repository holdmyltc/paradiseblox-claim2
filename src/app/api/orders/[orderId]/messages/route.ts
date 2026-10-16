import { after, NextResponse } from "next/server";
import { z } from "zod";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { getMessages, MESSAGE_COLUMNS, toChatMessage } from "@/lib/messages";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { verifyUploads } from "@/lib/storage";
import { pingOrder } from "@/lib/realtime";
import { CARD_BLOCK_MESSAGE, containsCardNumber } from "@/lib/card-guard";
import { logEvent } from "@/lib/audit";
import { pushToAdmins } from "@/lib/push";
import { enforceRateLimit } from "@/lib/rate-limit";

async function access(request: Request, orderId: string) {
  const db = supabaseAdmin();
  const [{ data: order }, admin] = await Promise.all([
    db.from("orders").select("id,email,chat_locked,order_number,status,roblox_username").eq("id", orderId).maybeSingle(),
    requireAdmin(request),
  ]);
  if (!order) return null;
  if (admin) return { order, sender: "admin" as const, admin };
  const session = await readCustomerSession();
  if (canAccessOrder(session, order.id, order.email)) return { order, sender: "customer" as const, admin: null };
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const a = await access(request, orderId);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const markRead = a.sender === "admin"
    ? db.from("messages").update({ read_by_admin_at: now }).eq("order_id", orderId).eq("sender", "customer").is("read_by_admin_at", null)
    : db.from("messages").update({ read_by_customer_at: now }).eq("order_id", orderId).eq("sender", "admin").is("read_by_customer_at", null);
  after(async () => {
    try { await markRead; } catch (e) { console.error("read receipt failed", e); }
  });

  const afterParam = new URL(request.url).searchParams.get("after");
  const afterIso = afterParam && !Number.isNaN(Date.parse(afterParam)) ? new Date(afterParam).toISOString() : null;
  return NextResponse.json({ messages: await getMessages(orderId, afterIso) });
}

const bodySchema = z.object({
  body: z.string().max(4000).optional().default(""),
  attachments: z.array(z.object({ path: z.string().max(300), name: z.string().max(200).optional().default("") })).max(10).optional().default([]),
});

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const a = await access(request, orderId);
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (a.order.chat_locked && a.sender !== "admin") return NextResponse.json({ error: "This chat is closed" }, { status: 409 });
    if (a.order.status === "cancelled" && a.sender !== "admin") return NextResponse.json({ error: "This order was cancelled" }, { status: 409 });

    // Pages opened before this update still send the old form format. Text only from those.
    const type = request.headers.get("content-type") || "";
    let input: z.infer<typeof bodySchema>;
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      input = { body: String(form.get("body") || ""), attachments: [] };
    } else {
      input = bodySchema.parse(await request.json());
    }
    const body = input.body.trim();
    if (!body && input.attachments.length === 0) return NextResponse.json({ error: "Write a message or add a screenshot" }, { status: 400 });

    if (a.sender === "customer") {
      await enforceRateLimit(request, "chat_message", orderId, 40, 300);
      if (containsCardNumber(body)) {
        await logEvent(orderId, "customer", "card_number_blocked", request);
        return NextResponse.json({ error: CARD_BLOCK_MESSAGE, code: "card_number" }, { status: 422 });
      }
    }

    const files = input.attachments.length ? await verifyUploads("chat-attachments", orderId, input.attachments) : [];

    const db = supabaseAdmin();
    const { data, error } = await db.from("messages").insert({
      order_id: orderId,
      sender: a.sender,
      body,
      attachments: files.map((f) => ({ path: f.path, name: f.name, mime: f.mime, size: f.size })),
    }).select(MESSAGE_COLUMNS).single();
    if (error) throw error;

    const [message] = await Promise.all([toChatMessage(data), pingOrder(orderId)]);

    after(async () => {
      if (a.sender === "customer") {
        await logEvent(orderId, "customer", "message_sent", request, files.length ? { screenshots: files.length } : {});
        const who = a.order.roblox_username ? `@${a.order.roblox_username}` : "Customer";
        await pushToAdmins({
          title: `${a.order.order_number}: ${who}`,
          body: body ? body.slice(0, 140) : `Sent ${files.length} screenshot${files.length === 1 ? "" : "s"}`,
          url: `/admin?order=${orderId}`,
          tag: `msg-${orderId}`,
          kind: "message",
        });
      } else if (files.length) {
        await logEvent(orderId, "admin", "admin_proof_uploaded", request, { screenshots: files.length, inChat: true });
      }
    });

    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Message failed" }, { status: 400 });
  }
}
