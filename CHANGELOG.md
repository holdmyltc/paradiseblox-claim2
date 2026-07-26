"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VerifyForm() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/orders/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, email }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) router.push(`/order/${encodeURIComponent(data.order.orderNumber.replace("#", ""))}`);
    else setError(data.error || "Order could not be verified");
    setLoading(false);
  }

  return (
    <form className="claim-form" onSubmit={submit}>
      <div className="claim-form-group">
        <label htmlFor="orderId">Order Number</label>
        <div className="claim-field">
          <span className="claim-field-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M5.25 8.25h13.5M5.25 15.75h13.5M9.75 3.75 7.5 20.25M16.5 3.75l-2.25 16.5" /></svg>
          </span>
          <input
            id="orderId"
            required
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder="#92497"
            autoComplete="off"
          />
          <span className="claim-focus-border" />
        </div>
      </div>

      <div className="claim-form-group">
        <label htmlFor="email">Email Address</label>
        <div className="claim-field">
          <span className="claim-field-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M3.75 6.75h16.5v10.5H3.75z" /><path d="m4.5 7.5 7.5 5.25 7.5-5.25" /></svg>
          </span>
          <input
            id="email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
          />
          <span className="claim-focus-border" />
        </div>
      </div>

      {error && <div className="claim-form-error" role="alert">{error}</div>}

      <button className="claim-submit" type="submit" disabled={loading || !orderId.trim() || !email.trim()}>
        <span className="claim-submit-sheen" />
        <span className="claim-submit-content">
          {loading ? <span className="claim-spinner" /> : <>Claim Order <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.5 4.5 7.5 7.5-7.5 7.5M21 12H3" /></svg></>}
        </span>
      </button>
    </form>
  );
}
