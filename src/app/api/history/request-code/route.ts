import { NextResponse } from "next/server";
import { z } from "zod";
import { hmacHex, randomSixDigitCode } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendVerificationCodeEmail } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(await request.json());
    const normalized = email.toLowerCase();
    await enforceRateLimit(request, "history_code", normalized, 3, 600);
    const secret = process.env.EMAIL_CODE_SECRET;
    if (!secret) throw new Error("EMAIL_CODE_SECRET is not configured");
    const code = randomSixDigitCode();
    const db = supabaseAdmin();
    await db.from("email_codes").insert({
      email: normalized,
      code_hash: hmacHex(`${normalized}:${code}`, secret),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    await sendVerificationCodeEmail(email, code);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send code" }, { status: 400 });
  }
}
