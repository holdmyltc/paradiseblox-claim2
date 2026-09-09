import { NextResponse } from "next/server";
import { getOrderById } from "@/lib/orders";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { getMessages, toChatMessage } from "@/lib/messages";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { uploadPrivateFile } from "@/lib/storage";

async function access(request: Request, orderId: string) {
  const order = await getOrderById(orderId);
  if (!order) return null;
  const admin = await requireAdmin(request);
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

  // Read receipts are fire-and-forget. This UPDATE ran on every poll — roughly
  // 24 writes a minute per open tab, almost always matching zero rows — and the
  // response was waiting on it. Nothing in the payload depends on the result.
  const markRead = a.sender === "admin"
    ? db.from("messages").update({ read_by_admin_at: now }).eq("order_id", orderId).eq("sender", "customer").is("read_by_admin_at", null)
    : db.from("messages").update({ read_by_customer_at: now }).eq("order_id", orderId).eq("sender", "admin").is("read_by_customer_at", null);
  void Promise.resolve(markRead).catch((e) => console.error("read receipt failed", e));

  return NextResponse.json({ messages: await getMessages(orderId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const a = await access(request, orderId);
    if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (a.order.chat_locked && a.sender !== "admin") return NextResponse.json({ error: "This chat is read-only" }, { status: 409 });

    const form = await request.formData();
    const body = String(form.get("body") || "").trim();
    const file = form.get("file");
    if (!body && !(file instanceof File)) return NextResponse.json({ error: "Write a message or attach a file" }, { status: 400 });

    let attachment: any = {};
    if (file instanceof File && file.size) attachment = await uploadPrivateFile("chat-attachments", orderId, file);

    const db = supabaseAdmin();
    // `.select().single()` hands back the inserted row, so we skip the old
    // getMessages(orderId).at(-1) — which re-read and re-signed the entire
    // thread just to return one message.
    const { data, error } = await db.from("messages").insert({
      order_id: orderId,
      sender: a.sender,
      // an image-only message now stays empty instead of showing a literal
      // "Attachment" bubble above the picture
      body: body || "",
      attachment_path: attachment.path || null,
      attachment_name: attachment.name || null,
      attachment_mime: attachment.mime || null,
    }).select("id,sender,body,created_at,attachment_path,attachment_name,attachment_mime").single();
    if (error) throw error;

    return NextResponse.json({ message: await toChatMessage(data) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Message failed" }, { status: 400 });
  }
}
