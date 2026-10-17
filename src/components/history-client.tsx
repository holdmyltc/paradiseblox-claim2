"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicOrder } from "@/lib/types";
import { formatMoney } from "@/components/order-details";

const LABEL: Record<string, string> = { paid: "Waiting for you", in_progress: "Delivering", delivered: "Delivered", completed: "Completed", cancelled: "Cancelled" };
const FILTERS: Array<[string, string]> = [["all", "All statuses"], ["active", "Delivering"], ["delivered", "Delivered"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
/** "Active" means we are still working on it. Delivered has its own filter. */
const ACTIVE = ["paid", "in_progress"];

function orderPath(o: PublicOrder) { return `/order/${encodeURIComponent(o.orderNumber.replace("#", ""))}`; }
function date(iso: string) { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
function time(iso: string) { return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); }
function itemsTitle(o: PublicOrder) {
  if (!o.items.length) return "Order";
  const first = o.items[0];
  const name = `${first.quantity > 1 ? `${first.quantity}x ` : ""}${first.name}`;
  return o.items.length > 1 ? `${name} + ${o.items.length - 1} more` : name;
}
function games(o: PublicOrder) { return [...new Set(o.items.map((i) => i.game).filter(Boolean))].join(", "); }

function Thumb({ o }: { o: PublicOrder }) {
  const img = o.items.find((i) => i.imageUrl)?.imageUrl;
  return img ? <img className="acct-thumb" src={img} alt="" loading="lazy" /> : <span className="acct-thumb acct-thumb-empty" aria-hidden="true" />;
}

function Status({ o }: { o: PublicOrder }) {
  return <span className={`badge badge-${o.onHold ? "hold" : o.status}`}>{o.onHold ? "Being reviewed" : LABEL[o.status] || o.status}</span>;
}

function Account({ email, orders }: { email: string; orders: PublicOrder[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<"recent" | "oldest">("recent");
  const [leaving, setLeaving] = useState(false);

  const shown = useMemo(() => {
    const list = orders.filter((o) => filter === "all" ? true : filter === "active" ? ACTIVE.includes(o.status) : o.status === filter);
    return list.sort((a, b) => (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * (sort === "recent" ? 1 : -1));
  }, [orders, filter, sort]);

  async function logout() {
    setLeaving(true);
    await fetch("/api/history/logout", { method: "POST" }).catch(() => {});
    router.refresh();
  }

  return <section className="acct">
    <div className="acct-head">
      <div>
        <h1 className="acct-title">My orders</h1>
        <p className="acct-sub">Logged in as <strong>{email}</strong></p>
      </div>
      <button className="btn btn-ghost btn-sm" type="button" onClick={logout} disabled={leaving}>{leaving ? <span className="spinner" /> : "Log out"}</button>
    </div>

    <div className="acct-tools">
      <label className="acct-select"><span className="sr-only">Status</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="acct-select"><span className="sr-only">Sort</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as "recent" | "oldest")}><option value="recent">Recent</option><option value="oldest">Oldest</option></select>
      </label>
    </div>

    {!orders.length ? <div className="panel empty-panel">
      <p className="status-text">There are no orders linked to {email} yet. If you just paid, give it a minute and refresh.</p>
      <a className="btn btn-primary" href="https://paradiseblox.com">Shop Paradise Blox</a>
    </div> : !shown.length ? <div className="panel"><p className="empty-note">No orders with this status.</p></div> : <>
      {/* computer: table */}
      <div className="acct-table" role="table" aria-label="Your orders">
        <div className="acct-tr acct-th" role="row">
          <span role="columnheader">Order</span><span role="columnheader">Order ID</span><span role="columnheader">Ordered</span><span role="columnheader">Status</span><span role="columnheader" className="acct-right">Total</span>
        </div>
        {shown.map((o) => <Link key={o.id} href={orderPath(o)} className="acct-tr" role="row">
          <span className="acct-order" role="cell">
            <Thumb o={o} />
            <span className="acct-order-text">
              <span className="acct-game">{games(o)}</span>
              <strong>{itemsTitle(o)}</strong>
              {(o.unreadCount || 0) > 0 && <span className="acct-new">New message</span>}
            </span>
          </span>
          <span role="cell" className="acct-num">{o.orderNumber}</span>
          <span role="cell" className="acct-date">{date(o.createdAt)}<small>{time(o.createdAt)}</small></span>
          <span role="cell"><Status o={o} /></span>
          <span role="cell" className="acct-right acct-total">{formatMoney(o.totalAmount, o.currency)}</span>
        </Link>)}
      </div>

      {/* phone: cards */}
      <div className="acct-cards">
        {shown.map((o) => <Link key={o.id} href={orderPath(o)} className="acct-card">
          <Thumb o={o} />
          <span className="acct-card-main">
            <span className="acct-game">{games(o)}</span>
            <strong>{itemsTitle(o)}</strong>
            <span className="acct-card-meta">{o.orderNumber} · {date(o.createdAt)}</span>
            <span className="acct-card-row"><Status o={o} />{(o.unreadCount || 0) > 0 && <span className="acct-new">New message</span>}</span>
          </span>
          <span className="acct-total">{formatMoney(o.totalAmount, o.currency)}</span>
        </Link>)}
      </div>
    </>}
  </section>;
}

function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [subscribe, setSubscribe] = useState(false);
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
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "That code didn't work"); setLoading(false); }
  }

  return <section className="panel">
    <h1 className="status-title">Log in to see your orders</h1>
    <p className="status-text">Enter the email you used at checkout. We'll send you a 6-digit code, and you'll stay logged in on this device for 90 days.</p>
    {step === "email" ? <form className="verify" onSubmit={request}>
      <label className="field"><span className="field-label">Checkout email</span>
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!email.trim() || loading}>{loading ? <span className="spinner" /> : "Send my code"}</button>
    </form> : <form className="verify" onSubmit={verify}>
      <div className="notice notice-info"><div>We sent a code to <b style={{ color: "var(--text)" }}>{email}</b>. Check your spam folder if you can't see it.</div></div>
      <label className="field"><span className="field-label">6-digit code</span>
        <input className="input input-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" autoFocus /></label>
      <label className="check"><input type="checkbox" checked={subscribe} onChange={(e) => setSubscribe(e.target.checked)} /><span>Email me Paradise Blox deals and new items. This is optional.</span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={code.length !== 6 || loading}>{loading ? <span className="spinner" /> : "Log in"}</button>
      <button className="btn btn-link" type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }}>Use a different email</button>
    </form>}
  </section>;
}

export function HistoryClient({ account }: { account: { email: string; orders: PublicOrder[] } | null }) {
  return account ? <Account email={account.email} orders={account.orders} /> : <Login />;
}
