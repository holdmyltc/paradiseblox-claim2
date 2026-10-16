"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AuditEvent, ChatMessage, DeliveryProof, ItemDeliveryStatus, PublicOrder, StoreStatus } from "@/lib/types";
import { ChatPanel } from "@/components/chat-panel";
import { formatMoney } from "@/components/order-details";
import { prepareImage, imagesFromFiles } from "@/lib/client-images";
import { uploadImages } from "@/lib/client-upload";

const STATUS: Record<string, string> = { paid: "New", in_progress: "Delivering", delivered: "Delivered", completed: "Completed", cancelled: "Cancelled" };
/** "New" once the Roblox account is linked, "No Roblox yet" before that. */
function statusLabel(o: PublicOrder) {
  if (o.status === "paid" && !o.roblox) return "No Roblox yet";
  return STATUS[o.status] ?? o.status;
}
const FILTERS: Array<[string, string]> = [["active", "Active"], ["unclaimed", "New"], ["hold", "On hold"], ["risk", "Risky"], ["delivered", "Delivered"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All"]];
const AUTO_HOURS = 24;

const ACTION_LABEL: Record<string, string> = {
  claim_link_opened: "Opened from the email link", order_link_opened: "Opened from a notification email", order_verified: "Opened with order number and email",
  history_opened: "Viewed order history", order_viewed: "Viewed the order", roblox_confirmed: "Linked Roblox and ticked the agreement",
  message_sent: "Sent a message", card_number_blocked: "Tried to send a card number (blocked)", received_confirmed: "Tapped Received",
  not_yet: "Tapped Not yet", auto_received: "Auto received after 24 hours", admin_started: "You started delivery", admin_delivered: "You marked delivered",
  admin_completed: "You completed it", admin_cancelled: "You cancelled it", admin_reopened: "You reopened it", admin_item_update: "You updated an item",
  admin_proof_uploaded: "You added proof", risk_flagged: "Flagged by the risk check", risk_approved: "You approved it", risk_cancelled: "You cancelled it after review",
  chat_locked: "You closed the chat", chat_unlocked: "You reopened the chat",
};

function actionLabel(action: string) {
  const known = ACTION_LABEL[action];
  if (known) return known;
  const words = action.replace(/^admin_/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Two different sounds, made in the browser: a rising chime for new orders, a soft ping for messages. */
function playSound(kind: "order" | "message") {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const c = new Ctx();
    const notes = kind === "order" ? [660, 880, 1320] : [880, 1175];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      const t = c.currentTime + i * 0.13;
      o.type = "sine";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.32);
    });
    setTimeout(() => c.close().catch(() => {}), 1200);
  } catch {}
}

function ago(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fullTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function RiskBadge({ order }: { order: PublicOrder }) {
  if (order.onHold) return <span className="badge badge-hold">On hold</span>;
  if (order.risk?.level === "high") return <span className="badge badge-high">High risk</span>;
  if (order.risk?.level === "medium") return <span className="badge badge-medium">Medium risk</span>;
  return null;
}

export function AdminClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [selected, setSelected] = useState<PublicOrder | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [proofs, setProofs] = useState<DeliveryProof[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [filter, setFilter] = useState("active");
  const [tab, setTab] = useState<"list" | "chat" | "info">("list");
  const [storeStatus, setStoreStatus] = useState<StoreStatus>("offline");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [completeReason, setCompleteReason] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofNote, setProofNote] = useState("");
  const [sound, setSound] = useState(false);
  const [pushState, setPushState] = useState<"unknown" | "unsupported" | "off" | "on" | "missing">("unknown");
  const [downloading, setDownloading] = useState(false);
  const loading = useRef(false);
  const openSeq = useRef(0);
  const seenMsg = useRef<Record<string, string>>({});
  const seenOrders = useRef<Set<string> | null>(null);
  const soundRef = useRef(false);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  const flash = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 4000);
  }, []);

  useEffect(() => { const t = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { try { setSound(localStorage.getItem("pb_admin_sound") === "1"); } catch {} }, []);

  /* ---------- auth ---------- */
  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => { setToken(data.session?.access_token || null); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setToken(s?.access_token || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) flash(error.message, "err"); else setToken(data.session.access_token);
  }
  async function logout() { await supabaseBrowser().auth.signOut(); setToken(null); setSelected(null); }

  const auth = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  /* ---------- list ---------- */
  const load = useCallback(async () => {
    if (!token || loading.current) return;
    loading.current = true;
    try {
      const r = await fetch(`/api/admin/orders?filter=${filter}&q=${encodeURIComponent(search)}`, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (r.status === 403) { setToken(null); return; }
      if (!r.ok) return;
      const d = await r.json();
      const list: PublicOrder[] = d.orders;
      setOrders(list);
      setStoreStatus(d.storeStatus === "online" ? "online" : "offline");
      setSelected((prev) => (prev ? list.find((o) => o.id === prev.id) ?? prev : prev));

      // sounds: new orders and new customer messages
      let newOrder = false, newMsg = false;
      if (seenOrders.current) { for (const o of list) if (!seenOrders.current.has(o.id) && o.status === "paid") newOrder = true; }
      seenOrders.current = new Set([...(seenOrders.current || []), ...list.map((o) => o.id)]);
      for (const o of list) {
        const stamp = o.lastCustomerMessageAt || "";
        if (stamp && seenMsg.current[o.id] !== undefined && seenMsg.current[o.id] !== stamp && (o.unreadCount || 0) > 0) newMsg = true;
        seenMsg.current[o.id] = stamp;
      }
      if (soundRef.current && (newOrder || newMsg)) playSound(newOrder ? "order" : "message");
    } catch { /* next tick */ } finally { loading.current = false; }
  }, [token, filter, search, auth]);

  useEffect(() => {
    if (!token) return;
    void load();
    const t = setInterval(() => void load(), 5000);
    const sb = supabaseBrowser();
    const ch = sb.channel("admin-feed").on("broadcast", { event: "ping" }, () => void load()).subscribe();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); sb.removeChannel(ch); window.removeEventListener("focus", onFocus); };
  }, [token, load]);

  const totalUnread = useMemo(() => orders.reduce((n, o) => n + (o.unreadCount || 0), 0), [orders]);
  useEffect(() => { document.title = totalUnread ? `(${totalUnread}) Paradise Blox Admin` : "Paradise Blox Admin"; }, [totalUnread]);

  const sorted = useMemo(() => [...orders].sort((x, y) => {
    const hx = x.onHold ? 1 : 0, hy = y.onHold ? 1 : 0;
    if (hx !== hy) return hy - hx;
    const ux = x.unreadCount ? 1 : 0, uy = y.unreadCount ? 1 : 0;
    if (ux !== uy) return uy - ux;
    const tx = new Date(x.lastCustomerMessageAt || x.createdAt).getTime();
    const ty = new Date(y.lastCustomerMessageAt || y.createdAt).getTime();
    return ty - tx;
  }), [orders]);

  /* ---------- open an order ---------- */
  const loadEvents = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/orders/${id}/events`, { headers: auth });
    if (r.ok) setEvents((await r.json()).events);
  }, [auth]);

  const open = useCallback(async (order: PublicOrder) => {
    const seq = ++openSeq.current;
    setSelected(order); setTab("chat"); setMessages(null); setProofs([]); setEvents([]);
    setCancelOpen(false); setCancelReason(""); setCompleteReason(""); setProofFiles([]); setProofNote(""); setShowAllEvents(false);
    try { const u = new URL(window.location.href); u.searchParams.set("order", order.id); history.replaceState(null, "", u.toString()); } catch {}
    const [m, p] = await Promise.all([
      fetch(`/api/orders/${order.id}/messages`, { headers: auth }),
      fetch(`/api/admin/orders/${order.id}/proof`, { headers: auth }),
    ]);
    if (seq !== openSeq.current) return;
    setMessages(m.ok ? (await m.json()).messages : []);
    if (p.ok) setProofs((await p.json()).proofs);
    void loadEvents(order.id);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, unreadCount: 0 } : o)));
  }, [auth, loadEvents]);

  // open the order from an alert link: /admin?order=...
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (!token || openedFromUrl.current) return;
    const id = new URLSearchParams(window.location.search).get("order");
    if (!id) { openedFromUrl.current = true; return; }
    (async () => {
      const r = await fetch(`/api/orders/${id}`, { headers: auth });
      if (r.ok) { openedFromUrl.current = true; void open((await r.json()).order); }
    })();
  }, [token, auth, open]);

  /* ---------- actions ---------- */
  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: { ...auth, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "That didn't work");
      if (d.order) { setSelected(d.order); setOrders((prev) => prev.map((o) => (o.id === d.order.id ? { ...o, ...d.order } : o))); }
      if (selected) void loadEvents(selected.id);
      void load();
      return d;
    } catch (e) {
      flash(e instanceof Error ? e.message : "That didn't work", "err");
      return null;
    } finally { setBusy(false); }
  }

  const s = selected;
  const pendingItems = s ? s.items.filter((i) => i.deliveryStatus === "pending").length : 0;
  const missingItems = s ? s.items.filter((i) => i.deliveryStatus === "missing").length : 0;

  async function setStatus(status: string, reason?: string) {
    if (!s) return;
    if (status === "delivered" && pendingItems > 0 && s.items.length > 1 && !confirm(`${pendingItems} item${pendingItems === 1 ? " isn't" : "s aren't"} ticked yet. Mark ${pendingItems === 1 ? "it" : "them"} as delivered too?`)) return;
    const d = await call(`/api/admin/orders/${s.id}/status`, "PATCH", { status, reason });
    if (d && status === "cancelled") { setSelected(null); setTab("list"); }
    if (d) { setCompleteReason(""); setCancelOpen(false); setCancelReason(""); }
  }

  async function setItem(itemId: string, status: ItemDeliveryStatus) {
    if (!s) return;
    setSelected({ ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, deliveryStatus: status } : i)) });
    await call(`/api/admin/orders/${s.id}/items`, "PATCH", { itemId, status });
  }

  async function decideRisk(action: "approve" | "cancel") {
    if (!s) return;
    if (action === "cancel" && !confirm("Cancel this order? Remember to refund it in Shopify.")) return;
    const d = await call(`/api/admin/orders/${s.id}/risk`, "PATCH", { action, reason: action === "cancel" ? cancelReason.trim() || undefined : undefined });
    if (d) flash(action === "approve" ? "Approved. You can deliver it now." : "Cancelled. Refund it in Shopify.");
  }

  async function setStore(next: StoreStatus) {
    setStoreStatus(next);
    const r = await fetch("/api/admin/settings", { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ storeStatus: next }) });
    if (!r.ok) { setStoreStatus(next === "online" ? "offline" : "online"); flash("Couldn't change the store status", "err"); }
  }

  async function uploadProof() {
    if (!s || !proofFiles.length) return;
    setBusy(true);
    try {
      const files = await Promise.all(proofFiles.map(prepareImage));
      const uploaded = await uploadImages(s.id, files, "proof", token);
      const r = await fetch(`/api/admin/orders/${s.id}/proof`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ files: uploaded, note: proofNote }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Upload failed");
      setProofs(d.proofs); setProofFiles([]); setProofNote(""); flash("Proof saved"); void loadEvents(s.id);
    } catch (e) { flash(e instanceof Error ? e.message : "Upload failed", "err"); }
    finally { setBusy(false); }
  }

  async function downloadEvidence() {
    if (!s) return;
    setDownloading(true);
    try {
      const r = await fetch(`/api/admin/orders/${s.id}/evidence`, { headers: auth });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't make the PDF");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ParadiseBlox-evidence-${s.orderNumber.replace("#", "")}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { flash(e instanceof Error ? e.message : "Couldn't make the PDF", "err"); }
    finally { setDownloading(false); }
  }

  /* ---------- alerts ---------- */
  useEffect(() => {
    if (!token) return;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") { setPushState("unsupported"); return; }
      const info = await fetch("/api/admin/push", { headers: auth }).then((r) => r.json()).catch(() => null);
      if (!info?.enabled) { setPushState("missing"); return; }
      const reg = await navigator.serviceWorker.getRegistration("/admin");
      const sub = await reg?.pushManager.getSubscription();
      setPushState(sub && Notification.permission === "granted" ? "on" : "off");
    })();
  }, [token, auth]);

  async function toggleSound() {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem("pb_admin_sound", next ? "1" : "0"); } catch {}
    if (next) playSound("message");
  }

  async function enablePush() {
    try {
      const info = await fetch("/api/admin/push", { headers: auth }).then((r) => r.json());
      if (!info?.enabled || !info.publicKey) { flash("Phone alerts need the VAPID keys added in Vercel first.", "err"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { flash("Allow notifications for this site to get alerts.", "err"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/admin" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(info.publicKey) });
      const r = await fetch("/api/admin/push", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't turn on alerts");
      setPushState("on"); flash("Alerts are on. You should get a test alert now.");
    } catch (e) {
      const ios = /iPhone|iPad/.test(navigator.userAgent) && !(window.navigator as any).standalone;
      flash(ios ? "On iPhone, add this page to your Home Screen first (Share, then Add to Home Screen), then open it from there." : e instanceof Error ? e.message : "Couldn't turn on alerts", "err");
    }
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration("/admin");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/admin/push", { method: "DELETE", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setPushState("off");
  }

  /* ---------- views ---------- */
  if (!ready) return <div className="admin-loading"><span className="spinner" /></div>;

  if (!token) return <div className="app admin-login">
    <form className="panel login-card" onSubmit={login}>
      <img className="login-logo" src="/pb-wordmark.png" alt="Paradise Blox" width={720} height={86} />
      <h1 className="status-title">Admin sign in</h1>
      <label className="field"><span className="field-label">Email</span><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span className="field-label">Password</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
    </form>
    {toast && <div className={`toast toast-${toast.tone}`} role="status">{toast.text}</div>}
  </div>;

  const holdCount = orders.filter((o) => o.onHold).length;
  const dueIn = s?.status === "delivered" && s.deliveredAt ? Math.max(0, AUTO_HOURS * 3_600_000 - (Date.now() - new Date(s.deliveredAt).getTime())) : null;
  const visibleEvents = showAllEvents ? events : events.slice(0, 12);

  return <div className="app admin">
    <header className="admin-top">
      <div className="admin-brand"><img src="/pb-wordmark.png" alt="Paradise Blox" width={720} height={86} /><span>Admin</span></div>
      <div className="admin-top-actions">
        <button type="button" className={`switch ${storeStatus === "online" ? "is-on" : ""}`} onClick={() => setStore(storeStatus === "online" ? "offline" : "online")} aria-pressed={storeStatus === "online"}>
          <span className="switch-track"><span className="switch-thumb" /></span>
          <span className="switch-label">{storeStatus === "online" ? "Online" : "Offline"}</span>
        </button>
        <button type="button" className={`chip-btn ${sound ? "is-on" : ""}`} onClick={toggleSound} title="Play a sound for new orders and messages while this page is open">{sound ? "Sound on" : "Sound off"}</button>
        {pushState !== "unsupported" && <button type="button" className={`chip-btn ${pushState === "on" ? "is-on" : ""}`} onClick={pushState === "on" ? disablePush : enablePush} title="Alerts on this phone or computer, even when the page is closed">{pushState === "on" ? "Phone alerts on" : "Phone alerts off"}</button>}
        <button type="button" className="chip-btn" onClick={logout}>Sign out</button>
      </div>
    </header>

    <nav className="admin-tabs" aria-label="Sections">
      <button type="button" className={tab === "list" ? "is-active" : ""} onClick={() => setTab("list")}>Orders{totalUnread ? <i>{totalUnread}</i> : null}</button>
      <button type="button" className={tab === "chat" ? "is-active" : ""} onClick={() => setTab("chat")} disabled={!s}>Chat</button>
      <button type="button" className={tab === "info" ? "is-active" : ""} onClick={() => setTab("info")} disabled={!s}>Details</button>
    </nav>

    <div className="admin-grid">
      <aside className={`admin-list ${tab === "list" ? "show" : ""}`}>
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order, email or username" aria-label="Search orders" />
        <div className="filters">
          {FILTERS.map(([key, label]) => <button key={key} type="button" className={`filter ${filter === key ? "is-active" : ""}`} onClick={() => setFilter(key)}>
            {label}{key === "hold" && holdCount > 0 && filter !== "hold" ? <i>{holdCount}</i> : null}
          </button>)}
        </div>
        <div className="olist">
          {sorted.map((o) => <button type="button" key={o.id} className={`orow ${s?.id === o.id ? "is-active" : ""} ${o.unreadCount ? "has-unread" : ""} ${o.onHold ? "is-hold" : ""}`} onClick={() => void open(o)}>
            <span className="orow-top">
              <strong>{o.orderNumber}</strong>
              <span className="orow-time">{ago(o.lastCustomerMessageAt || o.createdAt)}</span>
            </span>
            <span className="orow-mid">
              <span className="orow-user">{o.roblox ? `@${o.roblox.username}` : "Not claimed yet"}</span>
              <span className="orow-total">{formatMoney(o.totalAmount, o.currency)}</span>
            </span>
            <span className="orow-tags">
              <span className={`badge badge-${o.status}`}>{statusLabel(o)}</span>
              <RiskBadge order={o} />
              {o.unreadCount ? <span className="badge badge-unread">{o.unreadCount} new</span> : null}
              <span className="orow-games">{[...new Set(o.items.map((i) => i.game))].join(", ")}</span>
            </span>
          </button>)}
          {!sorted.length && <div className="empty-note">{search ? `Nothing found for "${search}".` : "No orders here."}</div>}
        </div>
      </aside>

      <main className={`admin-chat ${tab === "chat" ? "show" : ""}`}>
        {s ? <>
          <div className="admin-order-head">
            <div>
              <strong>{s.orderNumber}</strong>
              <span>{formatMoney(s.totalAmount, s.currency)} · {fullTime(s.createdAt)}</span>
            </div>
            <div className="admin-order-badges"><span className={`badge badge-${s.status}`}>{statusLabel(s)}</span><RiskBadge order={s} /></div>
          </div>
          {messages === null ? <div className="panel chat-loading"><span className="spinner" /></div> : <ChatPanel
            key={s.id}
            orderId={s.id}
            initialMessages={messages}
            locked={false}
            storeStatus={storeStatus}
            mode="admin"
            adminToken={token}
            customerAvatarUrl={s.roblox?.avatarUrl}
            customerName={s.roblox?.username}
            title={s.roblox ? `@${s.roblox.username}` : "Customer (not claimed yet)"}
            onChanged={() => void load()}
          />}
        </> : <div className="panel empty-panel"><p className="status-text">Pick an order to open its chat.</p></div>}
      </main>

      <aside className={`admin-info ${tab === "info" ? "show" : ""}`}>
        {s && <>
          {(s.onHold || s.risk?.level === "high" || s.risk?.level === "medium") && <section className={`panel card ${s.onHold ? "card-danger" : "card-warn"}`}>
            <h3 className="card-title">{s.onHold ? "On hold: high risk" : s.risk?.level === "high" ? "High risk (approved)" : "Medium risk"}</h3>
            <ul className="reasons">{(s.risk?.reasons || []).map((r) => <li key={r}>{r}</li>)}</ul>
            <dl className="mini-facts">
              <div><dt>Checkout IP</dt><dd>{s.risk?.checkoutIp || "Unknown"}</dd></div>
              <div><dt>Billing country</dt><dd>{s.risk?.billingCountry || "Unknown"}</dd></div>
              <div><dt>Past orders</dt><dd>{s.risk?.customerOrderCount ?? "Unknown"}</dd></div>
            </dl>
            {s.onHold && <>
              <p className="hint">The customer has been asked to send a banking app screenshot of the charge. Check the chat.</p>
              <input className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason if you cancel (optional)" />
              <div className="btn-row">
                <button className="btn btn-danger" type="button" onClick={() => decideRisk("cancel")} disabled={busy}>Cancel order</button>
                <button className="btn btn-success" type="button" onClick={() => decideRisk("approve")} disabled={busy}>Approve</button>
              </div>
            </>}
            {s.risk?.pending && <p className="hint">Shopify is still checking this payment. This updates on its own.</p>}
          </section>}

          <section className="panel card">
            <h3 className="card-title">Delivery</h3>
            <ul className="tick-list">
              {s.items.map((i) => <li key={i.id} className={`tick tick-${i.deliveryStatus}`}>
                {i.imageUrl ? <img src={i.imageUrl} alt="" /> : <span className="tick-img" />}
                <div className="tick-text"><strong>{i.quantity}x {i.name}</strong><span>{[i.variantTitle, i.game].filter(Boolean).join(" · ")}</span></div>
                <div className="seg" role="group" aria-label={`${i.name} delivery`}>
                  <button type="button" className={i.deliveryStatus === "delivered" ? "on ok" : ""} onClick={() => setItem(i.id, i.deliveryStatus === "delivered" ? "pending" : "delivered")} disabled={busy || s.status === "completed"} title="Delivered">
                    <svg viewBox="0 0 24 24"><path d="m5 12.5 4 4 10-10" /></svg></button>
                  <button type="button" className={i.deliveryStatus === "missing" ? "on bad" : ""} onClick={() => setItem(i.id, i.deliveryStatus === "missing" ? "pending" : "missing")} disabled={busy || s.status === "completed"} title="Couldn't deliver, refund it">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
                </div>
              </li>)}
            </ul>
            {missingItems > 0 && <p className="hint hint-warn">{missingItems} item{missingItems === 1 ? "" : "s"} marked not delivered. Refund {missingItems === 1 ? "it" : "them"} in Shopify.</p>}

            {(s.status === "paid" || s.status === "in_progress") && <div className="stack">
              {!s.roblox && <p className="hint">Waiting for the customer to link their Roblox account.</p>}
              <button className="btn btn-primary btn-block" type="button" onClick={() => setStatus("delivered")} disabled={busy || s.onHold}>Mark delivered</button>
              {s.onHold && <p className="hint">Approve the order before delivering it.</p>}
            </div>}

            {s.status === "delivered" && <div className="stack">
              <p className="hint">Waiting for the customer to tap Received.{dueIn !== null ? ` Completes on its own in ${Math.floor(dueIn / 3_600_000)}h ${Math.floor((dueIn % 3_600_000) / 60_000)}m.` : ""}</p>
              <input className="input" value={completeReason} onChange={(e) => setCompleteReason(e.target.value)} placeholder="Why you're completing it (needed)" />
              <button className="btn btn-success btn-block" type="button" onClick={() => setStatus("completed", completeReason)} disabled={busy || !completeReason.trim()}>Complete now</button>
              <button className="btn btn-ghost btn-block" type="button" onClick={() => setStatus("in_progress")} disabled={busy}>Back to delivering</button>
            </div>}

            {s.status === "completed" && <div className="stack">
              <p className="hint">Completed {fullTime(s.completedAt)} {s.completedBy === "auto" ? "automatically" : s.completedBy === "customer" ? "by the customer" : "by you"}.</p>
              <button className="btn btn-ghost btn-block" type="button" onClick={() => setStatus("in_progress")} disabled={busy}>Reopen</button>
            </div>}

            {s.status === "cancelled" && <button className="btn btn-ghost btn-block" type="button" onClick={() => setStatus("in_progress")} disabled={busy}>Reopen</button>}
          </section>

          <section className="panel card">
            <h3 className="card-title">Chargeback evidence</h3>
            <p className="hint">One PDF with the order, the Roblox account, the customer's agreement, every action with IP and device, the full chat and every screenshot.</p>
            <button className="btn btn-primary btn-block" type="button" onClick={downloadEvidence} disabled={downloading}>{downloading ? <span className="spinner" /> : "Download evidence PDF"}</button>
            <div className="proof-up">
              <label className="btn btn-ghost btn-block">
                Add delivery proof
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const f = imagesFromFiles(e.target.files); e.target.value = ""; setProofFiles((p) => [...p, ...f].slice(0, 10)); }} />
              </label>
              {proofFiles.length > 0 && <>
                <div className="drafts">{proofFiles.map((f, i) => <span className="draft" key={`${f.name}-${i}`}><img src={URL.createObjectURL(f)} alt="" /><button type="button" aria-label="Remove" onClick={() => setProofFiles((p) => p.filter((_, x) => x !== i))}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button></span>)}</div>
                <input className="input" value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Note (optional)" />
                <button className="btn btn-primary btn-block" type="button" onClick={uploadProof} disabled={busy}>Save {proofFiles.length} screenshot{proofFiles.length === 1 ? "" : "s"}</button>
              </>}
              {proofs.length > 0 && <div className="proofs-grid">{proofs.map((p) => <a key={p.id} href={p.fileUrl} target="_blank" rel="noreferrer"><img src={p.fileUrl} alt={p.note || "Proof"} /></a>)}</div>}
            </div>
            <h4 className="sub-title">Activity</h4>
            <ol className="events">
              {visibleEvents.map((e) => <li key={e.id}>
                <span className={`ev-dot ev-${e.actor}`} />
                <div><strong>{actionLabel(e.action)}</strong>
                  <span>{fullTime(e.createdAt)}{e.actor !== "system" && e.ip ? ` · ${e.ip}` : ""}{e.country ? ` · ${[e.city, e.country].filter(Boolean).join(", ")}` : ""}</span></div>
              </li>)}
              {!events.length && <li className="empty-note">Nothing logged yet.</li>}
            </ol>
            {events.length > 12 && <button className="btn btn-link" type="button" onClick={() => setShowAllEvents(!showAllEvents)}>{showAllEvents ? "Show less" : `Show all ${events.length}`}</button>}
          </section>

          <section className="panel card">
            <h3 className="card-title">Customer</h3>
            <dl className="mini-facts">
              <div><dt>Email</dt><dd className="break">{s.email}</dd></div>
              <div><dt>Roblox</dt><dd>{s.roblox ? <a href={`https://www.roblox.com/users/${s.roblox.userId}/profile`} target="_blank" rel="noreferrer">@{s.roblox.username}</a> : "Not linked"}</dd></div>
              {s.roblox && <div><dt>Display name</dt><dd>{s.roblox.displayName}</dd></div>}
              <div><dt>Paid</dt><dd>{fullTime(s.createdAt)}</dd></div>
            </dl>
          </section>

          {s.status !== "cancelled" && <section className="panel card">
            <h3 className="card-title">Order</h3>
            <button className="btn btn-ghost btn-block" type="button" onClick={() => call(`/api/admin/orders/${s.id}/status`, "PATCH", { chatLocked: !s.chatLocked })} disabled={busy}>{s.chatLocked ? "Reopen chat" : "Close chat"}</button>
            {!cancelOpen ? <button className="btn btn-danger-ghost btn-block" type="button" onClick={() => setCancelOpen(true)}>Cancel order</button> : <div className="stack">
              <p className="hint">The customer's order page will say it was cancelled. Refund it in Shopify.</p>
              <input className="input" autoFocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (needed)" />
              <div className="btn-row"><button className="btn btn-ghost" type="button" onClick={() => { setCancelOpen(false); setCancelReason(""); }}>Keep it</button><button className="btn btn-danger" type="button" onClick={() => setStatus("cancelled", cancelReason.trim())} disabled={busy || !cancelReason.trim()}>Cancel order</button></div>
            </div>}
          </section>}
        </>}
      </aside>
    </div>
    {toast && <div className={`toast toast-${toast.tone}`} role="status">{toast.text}</div>}
  </div>;
}
