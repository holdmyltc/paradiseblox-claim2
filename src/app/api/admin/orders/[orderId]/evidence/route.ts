import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/server";
import { buildEvidencePdf } from "@/lib/evidence";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Downloads the chargeback evidence PDF for one order. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { orderId } = await params;
  const { data: order } = await supabaseAdmin().from("orders").select("order_number").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  try {
    const pdf = await buildEvidencePdf(orderId);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ParadiseBlox-evidence-${order.order_number.replace("#", "")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("evidence pdf failed", e);
    return NextResponse.json({ error: "The evidence file couldn't be made. Try again." }, { status: 500 });
  }
}
