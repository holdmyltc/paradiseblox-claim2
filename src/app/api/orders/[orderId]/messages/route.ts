import { NextResponse } from "next/server";
import { canAccessOrder, readCustomerSession } from "@/lib/session";
import { getMessages, toChatMessage } from "@/lib/messages";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { uploadPrivateFile } from "@/lib/storage";
import { pingOrder } from "@/lib/realtime";

// Only load what the permission check needs, and run both lookups at the same time.
async function access(request: Request, orderId: string) {
  const db = supabaseAdmin();
  const [{ data: order }, admin] = await Promise.all([
    db.from("orders").select("id,email,chat_locked").eq("id", orderId).maybeSingle(),
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

  // Read receipts run in the background so the response never waits for them.
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
    const { data, error } = await db.from("messages").insert({
      order_id: orderId,
      sender: a.sender,
      body: body || "",
      attachment_path: attachment.path || null,
      attachment_name: attachment.name || null,
      attachment_mime: attachment.mime || null,
    }).select("id,sender,body,created_at,attachment_path,attachment_name,attachment_mime").single();
    if (error) throw error;

    const [message] = await Promise.all([toChatMessage(data), pingOrder(orderId)]);
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Message failed" }, { status: 400 });
  }
}
