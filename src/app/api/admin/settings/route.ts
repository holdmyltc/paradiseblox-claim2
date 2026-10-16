import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { pingAll } from "@/lib/realtime";

export async function PATCH(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { storeStatus } = z.object({ storeStatus: z.enum(["online", "offline"]) }).parse(await request.json());
  await supabaseAdmin().from("store_settings").upsert({ key: "store_status", value: storeStatus, updated_at: new Date().toISOString() });
  await pingAll();
  return NextResponse.json({ storeStatus });
}
