"use client";
import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, DeliveryProof, PublicOrder, RobloxProfile } from "@/lib/types";
import { ChatPanel } from "@/components/chat-panel";
import { OrderDetails } from "@/components/order-details";
import { StatusSteps } from "@/components/status-steps";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CONSENT_TEXT, HOLD_SAFETY, HOLD_TEXT, HOLD_TITLE, OFFLINE_NOTICE, RECEIVED_PROMPT } from "@/lib/copy";
import { SUPPORT_EMAIL } from "@/lib/config";
import { Avatar as RobloxAvatar } from "@/components/avatar";

function statusCopy(order: PublicOrder) {
  if (order.onHold) return { title: HOLD_TITLE, text: "We'll update you in the chat below as soon as we've checked it." };
  if (order.status === "completed") return {
    title: "Order completed",
    text: order.completedBy === "auto"
      ? "This order was marked received automatically 24 hours after delivery. Your chat and delivery record are saved here."
      : "Thanks for shopping with Paradise Blox. Your chat and delivery record are saved here.",
  };
  if (order.status === "delivered") return { title: "Order delivered", text: "We've sent your items. Check everything in-game, then tap Received below." };
  return { title: "Delivering your order", text: "We're getting your items ready. Most orders are done in 1 to 20 minutes. Keep an eye on the chat." };
}

function Notice({ tone, title, children }: { tone: "warn" | "info" | "danger"; title?: string; children: React.ReactNode }) {
  return <div className={`notice notice-${tone}`} role={tone === "danger" ? "alert" : undefined}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{tone === "info" ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></> : <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17v.5" /></>}</svg>
    <div>{title && <strong>{title}</strong>}<div>{children}</div></div>
  </div>;
}

function StaySecure() {
  return <section className="panel secure">
    <h2 className="secure-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.6 3.4 8.4 8 9 4.6-.6 8-4.4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>Stay secure</h2>
    <ol>
      <li>Keep everything in this chat. We'll never message you anywhere else first.</li>
      <li>We only ever need your Roblox username. Never share your password or a login code.</li>
      <li>Only accept the trade or gift from the account we tell you about here.</li>
      <li>Tap Received only once every item is in your game.</li>
    </ol>
  </section>;
}

function LinkRoblox({ order, onLinked }: { order: PublicOrder; onLinked: (o: PublicOrder) => void }) {
  const [username, setUsername] = useState("");
  const [candidate, setCandidate] = useState<RobloxProfile | null>(null);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const demo = order.id === "demo-order";

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!username.trim()) return;
    setLoading(true); setError("");
    try {
      if (demo) { setCandidate({ userId: 1, username: username.trim(), displayName: username.trim(), avatarUrl: null }); return; }
      const r = await fetch("/api/roblox/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Roblox lookup failed");
      setCandidate(d.profile); setAgree(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Roblox lookup failed"); }
    finally { setLoading(false); }
  }

  async function confirm() {
    if (!candidate || !agree) return;
    setLoading(true); setError("");
    try {
      if (demo) { onLinked({ ...order, roblox: candidate, status: "in_progress" }); return; }
      const r = await fetch(`/api/orders/${order.id}/roblox`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: candidate.username, consent: true }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not link your account");
      onLinked(d.order);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not link your account"); }
    finally { setLoading(false); }
  }

  return <section className="panel link">
    <div className="link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></svg></div>
    <h1 className="link-title">Link your Roblox account</h1>
    <p className="link-text">Enter the Roblox username that should get the items from order <strong>{order.orderNumber}</strong>.</p>

    {!candidate ? <form onSubmit={lookup} className="link-form">
      <label className="field">
        <span className="field-label">Roblox username</span>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} placeholder="Your Roblox username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={!username.trim() || loading}>{loading ? <span className="spinner" /> : "Find my account"}</button>
      <p className="link-hint">We never ask for your password.</p>
    </form> : <div className="link-confirm">
      <div className="candidate">
        <RobloxAvatar src={candidate.avatarUrl} name={candidate.displayName} fallbackClassName="roblox-fallback" />
        <div>
          <div className="candidate-name">{candidate.displayName}</div>
          <div className="candidate-user">@{candidate.username}</div>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{CONSENT_TEXT}</span>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="btn-row">
        <button className="btn btn-ghost" type="button" onClick={() => { setCandidate(null); setError(""); }}>Not me</button>
        <button className="btn btn-primary" type="button" onClick={confirm} disabled={!agree || loading}>{loading ? <span className="spinner" /> : "Yes, this is my account"}</button>
      </div>
    </div>}
  </section>;
}

export function OrderPageClient({ initialOrder, initialMessages, initialProofs }: { initialOrder: PublicOrder; initialMessages: ChatMessage[]; initialProofs: DeliveryProof[] }) {
  const [order, setOrder] = useState(initialOrder);
  const [proofs, setProofs] = useState(initialProofs);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const demo = order.id === "demo-order";

  const refresh = useCallback(async (view = false) => {
    try {
      const r = await fetch(`/api/orders/${order.id}${view ? "?view=1" : ""}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const d = await r.json();
      setOrder((prev) => JSON.stringify(prev) === JSON.stringify(d.order) ? prev : d.order);
      setProofs((prev) => JSON.stringify(prev.map((p) => p.id)) === JSON.stringify(d.proofs.map((p: DeliveryProof) => p.id)) ? prev : d.proofs);
    } catch {}
  }, [order.id]);

  useEffect(() => {
    if (demo) return;
    void refresh(true);
    let live = true;
    const t = setInterval(() => { if (live && document.visibilityState === "visible") void refresh(); }, 10000);
    const sb = supabaseBrowser();
    const state = sb.channel(`order-${order.id}-state`).on("broadcast", { event: "ping" }, () => void refresh()).subscribe();
    const store = sb.channel("store-status").on("broadcast", { event: "ping" }, () => void refresh()).subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; clearInterval(t); sb.removeChannel(state); sb.removeChannel(store); document.removeEventListener("visibilitychange", onVisible); };
  }, [order.id, demo, refresh]);

  async function act(action: "confirm" | "not_yet") {
    setActing(true); setError("");
    try {
      if (demo) { setOrder({ ...order, status: action === "confirm" ? "completed" : order.status, completedBy: "customer" }); return; }
      const r = await fetch(`/api/orders/${order.id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not update your order");
      setOrder(d.order);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update your order"); }
    finally { setActing(false); }
  }

  const offline = order.storeStatus !== "online" && order.status !== "completed";
  const copy = statusCopy(order);

  if (!order.roblox) return <div className="order-grid">
    <div className="order-main">
      {order.onHold && <Notice tone="danger" title={HOLD_TITLE}>{HOLD_TEXT} You can send it in the chat once you've linked your account.</Notice>}
      <LinkRoblox order={order} onLinked={setOrder} />
    </div>
    <aside className="order-side"><OrderDetails order={order} proofs={proofs} /></aside>
  </div>;

  const help = <p className="help-line">Need help? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order number.</p>;

  /* Phone: status, details, chat, safety tips, top to bottom.
     Computer: status across the top, big chat on the left, details on the right. */
  return <div className="order-layout">
    <div className="ol-top">
      <section className={`panel status ${order.onHold ? "is-hold" : ""}`}>
        {!order.onHold && <StatusSteps order={order} />}
        <div className="status-body">
          <img className="status-mascot" src="/pb-avatar.png" alt="" width={72} height={72} />
          <div>
            <h1 className="status-title">{copy.title}</h1>
            <p className="status-text">{copy.text}</p>
          </div>
        </div>

        {order.status === "delivered" && !order.onHold && <div className="received">
          <div className="received-copy">
            <strong>Did you get everything?</strong>
            <span>{RECEIVED_PROMPT}</span>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="btn-row">
            <button className="btn btn-ghost" type="button" onClick={() => act("not_yet")} disabled={acting}>Not yet</button>
            <button className="btn btn-success" type="button" onClick={() => act("confirm")} disabled={acting}>{acting ? <span className="spinner" /> : "Received"}</button>
          </div>
        </div>}

        {order.status === "completed" && <div className="review">
          <div>
            <strong>How did we do?</strong>
            <span>If you have a minute, an honest review on Trustpilot really helps other players find us.</span>
          </div>
          <a className="btn btn-trustpilot" href={order.trustpilotUrl} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.6 7.6h8l-6.5 4.7 2.5 7.7L12 17.3l-6.6 4.7 2.5-7.7L1.4 9.6h8z" /></svg>
            Review us on Trustpilot
          </a>
        </div>}
      </section>

      {order.onHold && <Notice tone="danger" title="How to help us approve your order">{HOLD_TEXT}<br /><strong>{HOLD_SAFETY}</strong></Notice>}
      {offline && !order.onHold && <Notice tone="warn">{OFFLINE_NOTICE}</Notice>}
    </div>

    <div className="ol-mobile"><OrderDetails order={order} proofs={proofs} collapsible /></div>

    <div className="ol-chat">
      <ChatPanel
        orderId={order.id}
        initialMessages={initialMessages}
        locked={order.chatLocked}
        storeStatus={order.storeStatus}
        customerAvatarUrl={order.roblox.avatarUrl}
        customerName={order.roblox.username}
        adminAvatarUrl="/pb-avatar.png"
        onChanged={() => void refresh()}
      />
    </div>

    <aside className="ol-side">
      <OrderDetails order={order} proofs={proofs} />
      <StaySecure />
      {help}
    </aside>

    <div className="ol-mobile ol-after"><StaySecure />{help}</div>
  </div>;
}
