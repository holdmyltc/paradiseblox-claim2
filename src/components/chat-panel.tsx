"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatAttachment, ChatMessage, StoreStatus } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { containsCardNumber, CARD_BLOCK_MESSAGE } from "@/lib/card-guard";
import { imagesFromClipboard, imagesFromFiles, prepareImage } from "@/lib/client-images";
import { uploadImages } from "@/lib/client-upload";
import { Avatar as RobloxAvatar } from "@/components/avatar";

type Draft = { id: string; file: File; url: string };
type LocalMessage = ChatMessage & { pending?: boolean; failed?: boolean; retry?: { body: string; files: File[] } };

const MAX_FILES = 10;

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}, ${t}`;
}

function systemTone(body: string) {
  const t = body.toLowerCase();
  if (/(cancel|couldn't|not yet|flagged|review|refund)/.test(t)) return "warn";
  if (/(linked|verified|delivered|received|complete|passed)/.test(t)) return "ok";
  return "info";
}

function Avatar({ src, label }: { src?: string | null; label: string }) {
  return <RobloxAvatar src={src} name={label} className="msg-avatar" fallbackClassName="msg-avatar msg-avatar-fallback" />;
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return <div className="lightbox" role="dialog" aria-modal="true" aria-label="Screenshot" onClick={onClose}>
    <img src={src} alt="Screenshot" onClick={(e) => e.stopPropagation()} />
    <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
      <a className="btn btn-ghost btn-sm" href={src} target="_blank" rel="noreferrer">Open full size</a>
      <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>Close</button>
    </div>
  </div>;
}

function Images({ items, onOpen }: { items: ChatAttachment[]; onOpen: (url: string) => void }) {
  if (!items.length) return null;
  return <div className={`msg-images count-${Math.min(items.length, 4)}`}>
    {items.map((a, i) => a.url
      ? <button type="button" key={`${a.url}-${i}`} className="msg-image" onClick={() => onOpen(a.url!)} aria-label={`Open screenshot ${i + 1}`}>
          <img src={a.url} alt={a.name || "Screenshot"} loading="lazy" />
        </button>
      : <span key={i} className="msg-image msg-image-missing">Screenshot unavailable</span>)}
  </div>;
}

export function ChatPanel({
  orderId, initialMessages, locked, storeStatus, mode = "customer", adminToken, onChanged,
  customerAvatarUrl, adminAvatarUrl = "/pb-avatar.png", customerName, title,
}: {
  orderId: string;
  initialMessages: ChatMessage[];
  locked: boolean;
  storeStatus: StoreStatus;
  mode?: "customer" | "admin";
  adminToken?: string | null;
  onChanged?: () => void;
  customerAvatarUrl?: string | null;
  adminAvatarUrl?: string | null;
  customerName?: string | null;
  title?: string;
}) {
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);
  const first = useRef(true);
  const lastActivity = useRef(Date.now());
  const demo = orderId === "demo-order";
  const online = storeStatus === "online";
  const authHeader = useMemo(() => (adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined), [adminToken]);

  /* ---------- scrolling ---------- */
  const scrollToBottom = (smooth: boolean) => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    if (first.current) { scrollToBottom(false); first.current = false; return; }
    if (pinned.current) scrollToBottom(true);
  }, [messages]);

  /* ---------- fetching ---------- */
  const newest = useRef<string | null>(null);
  useEffect(() => {
    const confirmed = messages.filter((m) => !m.pending && !m.failed && !m.id.startsWith("temp-"));
    newest.current = confirmed.length ? confirmed[confirmed.length - 1].createdAt : null;
  }, [messages]);

  const merge = useCallback((incoming: ChatMessage[], full: boolean) => {
    setMessages((prev) => {
      const local = prev.filter((m) => m.pending || m.failed);
      const base = full ? [] : prev.filter((m) => !m.pending && !m.failed);
      const byId = new Map(base.map((m) => [m.id, m]));
      let changed = full;
      for (const m of incoming) {
        const old = byId.get(m.id);
        if (!old || old.readByAdminAt !== m.readByAdminAt || old.readByCustomerAt !== m.readByCustomerAt) changed = true;
        byId.set(m.id, m);
      }
      if (!changed) return prev;
      const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (merged.length > base.length) lastActivity.current = Date.now();
      return [...merged, ...local];
    });
  }, []);

  const fetchNew = useCallback(async (full = false) => {
    try {
      const after = !full && newest.current ? `?after=${encodeURIComponent(newest.current)}` : "";
      const r = await fetch(`/api/orders/${orderId}/messages${after}`, { headers: authHeader, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!r.ok) return;
      const d = await r.json();
      merge(d.messages ?? [], full);
    } catch { /* the next tick tries again */ }
  }, [orderId, authHeader, merge]);

  useEffect(() => {
    if (demo) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let ticks = 0;
    const interval = () => {
      const idle = Date.now() - lastActivity.current;
      return idle < 30_000 ? 3000 : idle < 120_000 ? 6000 : 15000;
    };
    const tick = async () => {
      if (!live) return;
      if (document.visibilityState === "visible") {
        ticks++;
        // every 6th check reloads the whole thread so "Seen" ticks stay right
        await fetchNew(ticks % 6 === 0);
      }
      if (live) timer = setTimeout(tick, interval());
    };
    timer = setTimeout(tick, interval());
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      lastActivity.current = Date.now();
      clearTimeout(timer);
      void fetchNew(true).then(() => { if (live) timer = setTimeout(tick, interval()); });
    };
    document.addEventListener("visibilitychange", onVisible);
    const sb = supabaseBrowser();
    const channel = sb.channel(`order-${orderId}`).on("broadcast", { event: "ping" }, () => {
      lastActivity.current = Date.now();
      void fetchNew(false);
    }).subscribe();
    return () => { live = false; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); sb.removeChannel(channel); };
  }, [orderId, demo, fetchNew]);

  /* ---------- drafts ---------- */
  useEffect(() => () => drafts.forEach((d) => URL.revokeObjectURL(d.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(files: File[]) {
    if (!files.length || locked) return;
    setError("");
    const room = MAX_FILES - drafts.length;
    if (room <= 0) { setError(`You can send up to ${MAX_FILES} screenshots at a time.`); return; }
    if (files.length > room) setError(`Only the first ${room} screenshot${room === 1 ? "" : "s"} were added. The limit is ${MAX_FILES}.`);
    setPreparing(true);
    const ready: Draft[] = [];
    for (const f of files.slice(0, room)) {
      try {
        const file = await prepareImage(f);
        ready.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, url: URL.createObjectURL(file) });
      } catch (e) {
        setError(e instanceof Error ? e.message : "That image can't be sent.");
      }
    }
    setPreparing(false);
    if (ready.length) setDrafts((prev) => [...prev, ...ready]);
    inputRef.current?.focus();
  }

  function removeDraft(id: string) {
    setDrafts((prev) => {
      const d = prev.find((x) => x.id === id);
      if (d) URL.revokeObjectURL(d.url);
      return prev.filter((x) => x.id !== id);
    });
  }

  /* ---------- sending ---------- */
  async function deliver(tempId: string, body: string, files: File[]) {
    try {
      const uploaded = files.length ? await uploadImages(orderId, files, "chat", adminToken) : [];
      const r = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeader || {}) },
        body: JSON.stringify({ body, attachments: uploaded }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.code === "card_number") {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setText(body);
          setError(d.error);
          return;
        }
        throw new Error(d.error || "Message could not be sent");
      }
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId);
        return without.some((m) => m.id === d.message.id) ? without : [...without.filter((m) => !m.pending && !m.failed), d.message, ...without.filter((m) => m.pending || m.failed)];
      });
      onChanged?.();
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setError(e instanceof Error ? e.message : "Message could not be sent");
    }
  }

  function send() {
    if (locked || preparing) return;
    const body = text.trim();
    if (!body && !drafts.length) return;
    if (mode === "customer" && containsCardNumber(body)) { setError(CARD_BLOCK_MESSAGE); return; }
    const files = drafts.map((d) => d.file);
    const temp: LocalMessage = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sender: mode,
      body,
      createdAt: new Date().toISOString(),
      attachments: drafts.map((d) => ({ url: d.url, name: d.file.name, mime: d.file.type })),
      pending: true,
      retry: { body, files },
    };
    setMessages((prev) => [...prev, temp]);
    pinned.current = true;
    lastActivity.current = Date.now();
    setError("");
    setText("");
    setDrafts([]);
    if (demo) { setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...m, pending: false } : m))); return; }
    void deliver(temp.id, body, files);
  }

  function retry(m: LocalMessage) {
    if (!m.retry) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)));
    setError("");
    void deliver(m.id, m.retry.body, m.retry.files);
  }

  /* ---------- composer sizing ---------- */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const otherName = mode === "customer" ? "ParadiseBlox" : (customerName ? `@${customerName}` : "Customer");
  const otherAvatar = mode === "customer" ? adminAvatarUrl : customerAvatarUrl;

  // Last message I sent that the other side has read, for the "Seen" label
  const seenId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender !== mode) continue;
      const read = mode === "admin" ? m.readByCustomerAt : m.readByAdminAt;
      if (read) return m.id;
    }
    return null;
  }, [messages, mode]);

  return <section
    className={`chat ${dragging ? "is-dragging" : ""}`}
    onDragOver={(e) => { if (locked) return; if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDragging(true); } }}
    onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
    onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(imagesFromFiles(e.dataTransfer.files)); }}
  >
    <header className="chat-head">
      <div className="chat-who">
        <span className="chat-who-avatar"><Avatar src={otherAvatar} label={otherName} />{mode === "customer" && <i className={`presence ${online ? "on" : "off"}`} />}</span>
        <div>
          <div className="chat-who-name">{title || otherName}</div>
          <div className="chat-who-sub">{mode === "customer" ? (online ? "Online" : "Busier than usual") : "Order chat"}</div>
        </div>
      </div>
    </header>

    <div className="chat-log" ref={logRef} onScroll={() => { const el = logRef.current; if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }} aria-live="polite">
      {messages.length === 0 && <div className="chat-empty">
        {mode === "customer" ? "Say hi when you're ready. We'll reply right here." : "No messages yet."}
      </div>}

      {messages.map((m, i) => {
        if (m.sender === "system") {
          return <div className="msg-system" key={m.id}><span className={`pill-system tone-${systemTone(m.body)}`}>{m.body}</span><time>{timeLabel(m.createdAt)}</time></div>;
        }
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const groupStart = !prev || prev.sender !== m.sender || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
        const groupEnd = !next || next.sender !== m.sender || new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > 5 * 60_000;
        const mine = m.sender === mode;
        const isCustomer = m.sender === "customer";
        const name = isCustomer ? (customerName ? `@${customerName}` : "Customer") : "ParadiseBlox";
        return <div key={m.id} className={["msg", mine ? "mine" : "theirs", groupStart && "start", groupEnd && "end", m.pending && "pending", m.failed && "failed"].filter(Boolean).join(" ")}>
          {!mine && (groupEnd ? <Avatar src={isCustomer ? customerAvatarUrl : adminAvatarUrl} label={name} /> : <span className="msg-avatar-gap" />)}
          <div className="msg-stack">
            {groupStart && !mine && <div className="msg-name">{name}</div>}
            <Images items={m.attachments} onOpen={setLightbox} />
            {m.body && <div className="msg-bubble">{m.body}</div>}
            {groupEnd && <div className="msg-meta">
              {m.pending ? "Sending..." : m.failed ? <button type="button" className="msg-retry" onClick={() => retry(m)}>Not sent. Tap to try again</button> : timeLabel(m.createdAt)}
              {mode === "admin" && m.id === seenId && !m.pending && !m.failed && <span className="msg-seen">Seen</span>}
            </div>}
          </div>
        </div>;
      })}
    </div>

    {dragging && <div className="chat-drop">Drop screenshots to add them</div>}

    {locked ? <div className="chat-closed">This chat is closed. Your messages and delivery record stay saved here.</div> : <div className="composer">
      {drafts.length > 0 && <div className="drafts">
        {drafts.map((d) => <span className="draft" key={d.id}>
          <img src={d.url} alt="" />
          <button type="button" aria-label="Remove screenshot" onClick={() => removeDraft(d.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </span>)}
        {preparing && <span className="draft draft-loading"><span className="spinner" /></span>}
      </div>}
      {error && <div className="composer-error" role="alert">{error}</div>}
      <div className="composer-row">
        <label className="icon-btn composer-attach" title="Add screenshots">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-7 7" /></svg>
          <span className="sr-only">Add screenshots</span>
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const picked = imagesFromFiles(e.target.files); e.target.value = ""; void addFiles(picked); }} />
        </label>
        <textarea
          ref={inputRef}
          className="composer-input"
          rows={1}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => { const imgs = imagesFromClipboard(e.clipboardData); if (imgs.length) { e.preventDefault(); void addFiles(imgs); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !coarse) { e.preventDefault(); send(); } }}
          placeholder={mode === "admin" ? "Message the customer" : "Say something..."}
          aria-label="Message"
        />
        <button className="send-btn" type="button" onClick={send} disabled={preparing || (!text.trim() && !drafts.length)} aria-label="Send">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6-8-2Z" /><path d="m12 14 8-10" /></svg>
        </button>
      </div>
    </div>}

    {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
  </section>;
}
