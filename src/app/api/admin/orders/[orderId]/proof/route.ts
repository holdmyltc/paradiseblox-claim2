import { NextResponse } from "next/server";
import { z } from "zod";
import { getProofs } from "@/lib/messages";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { verifyUploads } from "@/lib/storage";
import { logEvent } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { orderId } = await params;
  return NextResponse.json({ proofs: await getProofs(orderId) });
}

const schema = z.object({
  note: z.string().max(500).optional(),
  files: z.array(z.object({ path: z.string().max(300), name: z.string().max(200).optional().default("") })).min(1).max(10),
});

/** Saves proof screenshots that were already uploaded straight to storage. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const { orderId } = await params;
    const input = schema.parse(await request.json());
    const files = await verifyUploads("delivery-proofs", orderId, input.files);
    const note = input.note?.trim() || null;
    const { error } = await supabaseAdmin().from("delivery_proofs").insert(files.map((f) => ({
      order_id: orderId, uploaded_by: admin.user.id, note, file_path: f.path, file_name: f.name, mime_type: f.mime,
    })));
    if (error) throw error;
    await logEvent(orderId, "admin", "admin_proof_uploaded", request, { screenshots: files.length });
    return NextResponse.json({ proofs: await getProofs(orderId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
