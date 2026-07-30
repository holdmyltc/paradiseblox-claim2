"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ChatMessage, DeliveryProof, PublicOrder, StoreStatus } from "@/lib/types";
import { ChatPanel } from "@/components/chat-panel";
import { OrderSidebar } from "@/components/order-sidebar";

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  in_progress: "In progress",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function AdminClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [selected, setSelected] = useState<PublicOrder | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proofs, setProofs] = useState<DeliveryProof[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("active");
  const [mobileTab, setMobileTab] = useState<"orders" | "detail">("orders");
  const [storeStatus, setStoreStatus] = useState<StoreStatus>("offline");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofNote, setProofNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setToken(s?.access_token || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { data, error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else setToken(data.session.access_token);
  }

  async function load() {
    if (!token) return;
    const r = await fetch(`/api/admin/orders?filter=${filter}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setOrders(d.orders);
    setStoreStatus(d.storeStatus);
    // functional updater: the interval closure would otherwise hold a stale `selected`
    setSelected((prev) => (prev ? d.orders.find((o: PublicOrder) => o.id === prev.id) ?? prev : prev));
  }

  useEffect(() => {
    load();
    if (!token) return;
    const t = setInterval(load, 3500);
    return () => clearInterval(t);
  }, [token, filter]);

  async function open(order: PublicOrder) {
    setSelected(order);
    setMobileTab("detail");
    setError("");
    const [m, p] = await Promise.all([
      fetch(`/api/orders/${order.id}/messages`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/admin/orders/${order.id}/proof`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (m.ok) setMessages((await m.json()).messages);
    if (p.ok) setProofs((await p.json()).proofs);
  }

  async function changeStatus(status: string) {
    if (!selected) return;
    setBusy(true);
    const r = await fetch(`/api/admin/orders/${selected.id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Status update failed"); return; }
    setReason("");
    setError("");
    if (status === "cancelled") { setSelected(null); setMobileTab("orders"); load(); return; }
    setSelected(d.order);
    load();
    open(d.order);
  }

  async function setChatLocked(chatLocked: boolean) {
    if (!selected) return;
    const r = await fetch(`/api/admin/orders/${selected.id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ chatLocked }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "Could not change chat lock");
    else { setSelected(d.order); load(); }
  }

  async function uploadProof() {
    if (!selected || !proofFiles.length) return;
    setUploading(true);
    setError("");
    let latest = proofs;
    let failed = "";
    for (const f of proofFiles) {
      const form = new FormData();
      form.set("file", f);
      form.set("note", proofNote);
      const r = await fetch(`/api/admin/orders/${selected.id}/proof`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { failed = d.error || `Upload failed for ${f.name}`; break; }
      latest = d.proofs;
    }
    setProofs(latest);
    setUploading(false);
    if (failed) setError(failed);
    else { setProofFiles([]); setProofNote(""); }
  }

  async function resendReceipt() {
    if (!selected) return;
    const r = await fetch(`/api/admin/orders/${selected.id}/receipt`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json().catch(() => ({}));
    setError(r.ok ? "Receipt email sent." : d.error || "Receipt could not be sent");
  }

  async function updateStoreStatus(value: StoreStatus) {
    setStoreStatus(value);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ storeStatus: value }),
    });
  }

  function cancelOrder() {
    if (!selected) return;
    if (!reason.trim()) { setError("Enter a reason before cancelling."); return; }
    const ok = confirm(
      `Cancel ${selected.orderNumber}?\n\n` +
      `• It disappears from your order list\n` +
      `• The customer's claim page stops working\n` +
      `• Their Roblox account is unlinked\n` +
      `• No email is sent\n\n` +
      `They can start a fresh claim with their order number and email.`
    );
    if (ok) changeStatus("cancelled");
  }

  // cancelled orders are hidden unless you deliberately look for them
  const filtered = useMemo(
    () => (filter === "cancelled" ? orders : orders.filter((o) => o.status !== "cancelled")),
    [orders, filter]
  );

  if (!token) return (
    <div className="app-shell">
      <div className="admin-auth-stage">
        <div className="admin-auth-inner">
          <div className="admin-auth-mark"><img src="/pb-avatar.png" alt="" /></div>
          <h1>ParadiseBlox <span>Admin</span></h1>
          <p className="admin-auth-lede">Manage deliveries, chat with customers, and track every order in one place.</p>
          <div className="admin-auth-card">
            <form onSubmit={login}>
              <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="field"><label>Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              {error && <div className="error-box">{error}</div>}
              <button className="btn btn-primary">Sign in</button>
              <p className="admin-auth-note">Admin access only. Accounts are managed in Supabase Auth.</p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  const s = selected;
  const isOpen = s ? s.status === "paid" || s.status === "in_progress" : false;

  return (
    <div className="app-shell">
      <div className="dashboard-shell">
        <div className="tabs">
          <button className={`btn ${mobileTab === "orders" ? "btn-blue" : "btn-soft"}`} onClick={() => setMobileTab("orders")}>Orders</button>
          <button className={`btn ${mobileTab === "detail" ? "btn-blue" : "btn-soft"}`} onClick={() => setMobileTab("detail")} disabled={!s}>Order chat</button>
        </div>

        <div className="admin-grid">
          <aside className={`admin-panel ${mobileTab === "orders" ? "mobile-show" : ""}`}>
            <div className="admin-toolbar">
              <select className="admin-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="active">Active</option>
                <option value="paid">Paid</option>
                <option value="in_progress">In progress</option>
                <option value="delivered">Delivered</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="all">All</option>
              </select>
              <select className="admin-select" value={storeStatus} onChange={(e) => updateStoreStatus(e.target.value as StoreStatus)}>
                <option value="online">Store online</option>
                <option value="busy">Store busy</option>
                <option value="offline">Store offline</option>
              </select>
            </div>

            <div className="order-list">
              {filtered.map((o) => (
                <button className={`order-list-item ${s?.id === o.id ? "active" : ""}`} key={o.id} onClick={() => open(o)}>
                  <div className="order-list-top">
                    <span>{o.orderNumber}</span>
                    {o.unreadCount
                      ? <span className="order-list-unread">{o.unreadCount} new</span>
                      : <span className={`order-list-status status-${o.status === "in_progress" ? "progress" : o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>}
                  </div>
                  <div className="order-list-last">
                    <span className="order-list-user">@{o.roblox?.username || "not linked"}</span>
                    <span className="order-list-games">{o.items.map((i) => i.game).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</span>
                  </div>
                </button>
              ))}
              {!filtered.length && <div className="empty-state">No orders in this view.</div>}
            </div>
          </aside>

          <main className={`admin-detail ${mobileTab === "detail" ? "mobile-show" : ""}`}>
            {s ? <>
              <div className="admin-detail-header">
                <div className="admin-detail-id">
                  <strong>{s.orderNumber}</strong>
                  <div className="small">{s.emailMasked} · @{s.roblox?.username || "not linked"}</div>
                </div>
                <span className={`status-pill status-${s.status === "in_progress" ? "progress" : s.status}`}>{STATUS_LABEL[s.status] || s.status}</span>
              </div>

              <div className="admin-body">
                <div className="admin-chat">
                  <ChatPanel
                    key={s.id}
                    orderId={s.id}
                    initialMessages={messages}
                    locked={s.chatLocked}
                    storeStatus={storeStatus}
                    mode="admin"
                    adminToken={token}
                    customerAvatarUrl={s.roblox?.avatarUrl}
                    customerName={s.roblox?.username}
                    adminAvatarUrl="/pb-avatar.png"
                  />
                </div>

                <div className="admin-controls">
                  {error && <div className="error-box">{error}</div>}

                  {/* Only the actions that apply to this status. The old panel
                      showed all eight at once, half of them disabled. */}
                  <section className="ctl-card">
                    <h3 className="ctl-title">Delivery</h3>

                    {s.status === "paid" && (
                      <button className="btn btn-blue" onClick={() => changeStatus("in_progress")} disabled={busy}>Start delivery</button>
                    )}

                    {isOpen && <>
                      <div className="ctl-field">
                        <label>Proof <span>optional</span></label>
                        <input
                          className="input"
                          type="file"
                          multiple
                          accept="image/png,image/jpeg,image/webp,video/mp4"
                          onChange={(e) => { const picked = Array.from(e.target.files || []); e.target.value = ""; if (picked.length) setProofFiles((prev) => [...prev, ...picked]); }}
                        />
                        {proofFiles.length > 0 && <div className="attachment-tray">
                          {proofFiles.map((f, i) => <span className="attachment-chip" key={`${f.name}-${i}`}>
                            {f.type.startsWith("image/") && <img src={URL.createObjectURL(f)} alt="" />}
                            <span className="attachment-chip-name">{f.name}</span>
                            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setProofFiles((prev) => prev.filter((_, x) => x !== i))}>×</button>
                          </span>)}
                          <button type="button" className="attachment-clear" onClick={() => setProofFiles([])}>Clear</button>
                        </div>}
                      </div>

                      {proofFiles.length > 0 && <>
                        <input className="input" value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Note (optional)" />
                        <button className="btn btn-soft" onClick={uploadProof} disabled={uploading}>
                          {uploading ? "Uploading…" : proofFiles.length > 1 ? `Upload ${proofFiles.length} files` : "Upload"}
                        </button>
                      </>}

                      <button className="btn btn-primary" onClick={() => changeStatus("delivered")} disabled={busy}>Mark delivered</button>
                    </>}

                    {s.status === "delivered" && <>
                      <p className="ctl-hint">Waiting on the customer to confirm. Complete it yourself only if they confirmed in chat.</p>
                      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
                      <button className="btn btn-confirm" onClick={() => changeStatus("completed")} disabled={busy || !reason.trim()}>Complete for customer</button>
                      <button className="btn btn-soft" onClick={() => changeStatus("in_progress")} disabled={busy}>Back to in progress</button>
                    </>}

                    {s.status === "completed" && <>
                      <p className="ctl-hint">This order is closed and the chat is read-only.</p>
                      <button className="btn btn-blue" onClick={resendReceipt}>Resend receipt email</button>
                      <button className="btn btn-soft" onClick={() => changeStatus("in_progress")} disabled={busy}>Reopen order</button>
                    </>}

                    {s.status === "cancelled" && <>
                      <p className="ctl-hint">Cancelled and hidden from the list. The customer can start a new claim with their order number and email.</p>
                      <button className="btn btn-soft" onClick={() => changeStatus("in_progress")} disabled={busy}>Reopen order</button>
                    </>}
                  </section>

                  {s.status !== "cancelled" && (
                    <section className="ctl-card">
                      <h3 className="ctl-title">Order</h3>
                      <button className="btn btn-soft" onClick={() => setChatLocked(!s.chatLocked)}>{s.chatLocked ? "Unlock chat" : "Lock chat"}</button>
                      {s.status !== "delivered" && s.status !== "completed" && (
                        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cancellation reason" />
                      )}
                      <button className="btn btn-danger" onClick={cancelOrder} disabled={busy}>Cancel order</button>
                      <p className="ctl-hint">Cancelling removes the order from this list, kills the customer's claim page and unlinks their Roblox account. No email is sent.</p>
                    </section>
                  )}

                  <OrderSidebar order={{ ...s, storeStatus }} proofs={proofs} />
                </div>
              </div>
            </> : <div className="empty-state">Select an order to open the chat and delivery controls.</div>}
          </main>
        </div>
      </div>
    </div>
  );
}
