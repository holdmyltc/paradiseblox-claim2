import { hmacHex, safeEqual } from "@/lib/crypto";

/** Signed, expiring link that opens one order without typing anything. Used in notification emails. */
function secret() {
  const value = process.env.CUSTOMER_SESSION_SECRET;
  if (!value || value.length < 24) throw new Error("CUSTOMER_SESSION_SECRET is missing or too short");
  return `order-link:${value}`;
}

export function createOrderLinkToken(orderId: string, days = 30) {
  const raw = Buffer.from(JSON.stringify({ o: orderId, e: Date.now() + days * 86_400_000 })).toString("base64url");
  return `${raw}.${hmacHex(raw, secret())}`;
}

export function readOrderLinkToken(token: string): string | null {
  const [raw, sig] = token.split(".");
  if (!raw || !sig || !safeEqual(hmacHex(raw, secret()), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!data?.o || !data?.e || data.e < Date.now()) return null;
    return String(data.o);
  } catch {
    return null;
  }
}
