"use client";
import { useState } from "react";
import Link from "next/link";
import type { PublicOrder } from "@/lib/types";
import { formatMoney } from "@/components/order-details";

const LABEL: Record<string, string> = { paid: "Waiting for you", in_progress: "Delivering", delivered: "Delivered", completed: "Completed", cancelled: "Cancelled" };

export function HistoryClient() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "orders">("email");
  const [subscribe, setSubscribe] = useState(false);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/history/request-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "The code couldn't be sent");
      setStep("code");
    } catch (err) { setError(err instanceof Error ? err.message : "The code couldn't be sent"); }
    finally { setLoading(false); }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/history/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), code, subscribe }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "That code didn't work");
      setOrders(d.orders); setStep("orders");
    } catch (err) { setError(err instanceof Error ? err.message : "That code didn't work"); }
    finally { setLoading(false); }
  }

  if (step === "orders") {
    const active = orders.filter((o) => ["paid", "in_progress", "delivered"].includes(o.status));
    const rest = orders.filter((o) => !["paid", "in_progress", "delivered"].includes(o.status));
    const row = (o: PublicOrder) => <Link href={`/order/${o.orderNumber.replace("#", "")}`} className="hist-row" key={o.id}>
      <span className="hist-thumbs">{o.items.slice(0, 2).map((i) => i.imageUrl ? <img key={i.id} src={i.imageUrl} alt="" /> : <span key={i.id} />)}</span>
      <span className="hist-main"><strong>{o.orderNumber}</strong><span>{o.items.length} item{o.items.length === 1 ? "" : "s"} · {formatMoney(o.totalAmount, o.currency)} · {new Date(o.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span></span>
      <span className={`badge badge-${o.status}`}>{LABEL[o.status] || o.status}</span>
    </Link>;
    return <section className="panel">
      <h1 className="status-title">Your orders</h1>
      {!orders.length && <p className="status-text">We couldn't find any orders for {email}.</p>}
      {active.length > 0 && <><h2 className="hist-h">Active</h2><div className="hist-list">{active.map(row)}</div></>}
      {rest.length > 0 && <><h2 className="hist-h">Past orders</h2><div className="hist-list">{rest.map(row)}</div></>}
    </section>;
  }

  return <section className="panel">
    <h1 className="status-title">See all your orders</h1>
    <p className="status-text">We'll email you a 6-digit code so only you can see the orders linked to your email.</p>
    {step === "email" ? <form className="verify" onSubmit={request}>
      <label className="field"><span className="field-label">Checkout email</span>
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!email.trim() || loading}>{loading ? <span className="spinner" /> : "Send my code"}</button>
    </form> : <form className="verify" onSubmit={verify}>
      <div className="notice notice-info"><div>We sent a code to <strong>{email}</strong>. Check your spam folder if you can't see it.</div></div>
      <label className="field"><span className="field-label">6-digit code</span>
        <input className="input input-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
      <label className="check"><input type="checkbox" checked={subscribe} onChange={(e) => setSubscribe(e.target.checked)} /><span>Email me Paradise Blox deals and new items. This is optional.</span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={code.length !== 6 || loading}>{loading ? <span className="spinner" /> : "Show my orders"}</button>
      <button className="btn btn-link" type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }}>Use a different email</button>
    </form>}
  </section>;
}
