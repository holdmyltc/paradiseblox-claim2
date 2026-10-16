"use client";
import { useState } from "react";
import type { DeliveryProof, PublicOrder } from "@/lib/types";
import { Avatar as RobloxAvatar } from "@/components/avatar";

export function formatMoney(amount: string | number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(amount) || 0); }
  catch { return `$${Number(amount || 0).toFixed(2)}`; }
}

const ITEM_STATUS: Record<string, string> = { delivered: "Delivered", missing: "Not delivered, refund" };

/** The right-hand "Order details" card: items, Roblox account, total and order ID. */
export function OrderDetails({ order, proofs = [], collapsible = false }: { order: PublicOrder; proofs?: DeliveryProof[]; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const [copied, setCopied] = useState(false);
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  const date = new Date(order.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  async function copy() {
    try { await navigator.clipboard.writeText(order.orderNumber); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }

  return <section className={`panel details ${collapsible ? "details-collapsible" : ""} ${open ? "is-open" : ""}`}>
    <button type="button" className="details-head" onClick={() => collapsible && setOpen(!open)} aria-expanded={open} disabled={!collapsible}>
      <span className="details-title">Order details</span>
      {collapsible && <span className="details-peek">{count} item{count === 1 ? "" : "s"} · {formatMoney(order.totalAmount, order.currency)}
        <svg className="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </span>}
    </button>

    {open && <div className="details-body">
      <ul className="items">
        {order.items.map((item) => <li className="item" key={item.id}>
          {item.imageUrl ? <img className="item-img" src={item.imageUrl} alt="" loading="lazy" /> : <span className="item-img" />}
          <div className="item-text">
            <div className="item-name">{item.name}</div>
            <div className="item-sub">
              {[item.variantTitle, item.game].filter(Boolean).join(" · ")}
              {item.attributes.map((a) => <span key={a.key}> · {a.key}: {a.value}</span>)}
            </div>
            {item.deliveryStatus !== "pending" && order.status !== "paid" && <span className={`item-status is-${item.deliveryStatus}`}>{ITEM_STATUS[item.deliveryStatus]}</span>}
          </div>
          <span className="item-qty">x{item.quantity}</span>
        </li>)}
      </ul>

      {order.roblox && <div className="roblox">
        <RobloxAvatar src={order.roblox.avatarUrl} name={order.roblox.displayName} fallbackClassName="roblox-fallback" />
        <div>
          <div className="roblox-name">{order.roblox.displayName}</div>
          <div className="roblox-user">@{order.roblox.username}</div>
        </div>
        <span className="roblox-badge">Roblox</span>
      </div>}

      <dl className="facts">
        <div><dt>Total paid</dt><dd className="facts-strong">{formatMoney(order.totalAmount, order.currency)}</dd></div>
        <div><dt>Order ID</dt><dd><button type="button" className="copy" onClick={copy}>{order.orderNumber}
          <svg viewBox="0 0 24 24" aria-hidden="true">{copied ? <path d="m5 12.5 4 4 10-10" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>}</svg>
          <span className="sr-only">{copied ? "Copied" : "Copy order ID"}</span>
        </button></dd></div>
        <div><dt>Ordered</dt><dd>{date}</dd></div>
      </dl>

      {proofs.length > 0 && <div className="proofs">
        <div className="proofs-title">Delivery proof</div>
        <div className="proofs-grid">{proofs.map((p) => <a key={p.id} href={p.fileUrl} target="_blank" rel="noreferrer"><img src={p.fileUrl} alt={p.note || "Delivery proof"} loading="lazy" /></a>)}</div>
      </div>}
    </div>}
  </section>;
}
