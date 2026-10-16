"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LINK_ERRORS: Record<string, string> = {
  "invalid-link": "That link has expired or doesn't work anymore. Enter your order number and email instead.",
  "invalid-receipt": "That receipt link has expired. Enter your order number and email to open your order.",
};

export function VerifyForm() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Links from the Shopify order email can fill these in: /?order=1234&email=you@example.com
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const o = p.get("order");
    const e = p.get("email");
    if (o) setOrderId(o.replace(/^#/, ""));
    if (e) setEmail(e);
    const err = p.get("error");
    if (err && LINK_ERRORS[err]) setError(LINK_ERRORS[err]);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId.trim(), email: email.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We couldn't find that order");
      router.push(`/order/${encodeURIComponent(data.order.orderNumber.replace("#", ""))}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't find that order");
      setLoading(false);
    }
  }

  return (
    <form className="verify" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Order number</span>
        <span className="input-wrap">
          <span className="input-icon" aria-hidden="true">#</span>
          <input className="input input-with-icon" required value={orderId} onChange={(e) => setOrderId(e.target.value.replace(/^#/, ""))} placeholder="92497" inputMode="numeric" autoComplete="off" />
        </span>
      </label>
      <label className="field">
        <span className="field-label">Checkout email</span>
        <input className="input" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || !orderId.trim() || !email.trim()}>
        {loading ? <span className="spinner" /> : "Open my order"}
      </button>
    </form>
  );
}
