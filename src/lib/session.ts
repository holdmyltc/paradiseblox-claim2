import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/config";
import { hmacHex, safeEqual } from "@/lib/crypto";

export type CustomerSession = {
  email: string;
  orderIds: string[];
  history: boolean;
  exp: number;
};

function secret() {
  const value = process.env.CUSTOMER_SESSION_SECRET;
  if (!value || value.length < 24) throw new Error("CUSTOMER_SESSION_SECRET is missing or too short");
  return value;
}

function encode(payload: CustomerSession) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${raw}.${hmacHex(raw, secret())}`;
}

function decode(value: string | undefined): CustomerSession | null {
  if (!value) return null;
  const [raw, signature] = value.split(".");
  if (!raw || !signature || !safeEqual(hmacHex(raw, secret()), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CustomerSession;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readCustomerSession() {
  const jar = await cookies();
  return decode(jar.get(SESSION_COOKIE)?.value);
}

export async function writeCustomerSession(payload: Omit<CustomerSession, "exp">, days = 7) {
  const jar = await cookies();
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  jar.set(SESSION_COOKIE, encode({ ...payload, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(exp),
  });
}

export function canAccessOrder(session: CustomerSession | null, orderId: string, orderEmail: string) {
  if (!session) return false;
  if (session.email.toLowerCase() !== orderEmail.toLowerCase()) return false;
  return session.history || session.orderIds.includes(orderId);
}
