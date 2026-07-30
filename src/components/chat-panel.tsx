"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, StoreStatus } from "@/lib/types";

/** A message that exists locally but the server hasn't confirmed yet. */
type LocalMessage = ChatMessage & { pending?: boolean; failed?: boolean; retryFile?: File | null };

const TONE_SUCCESS = ["verified", "ready", "preparing", "delivering", "delivered", "received", "complete"];
const TONE_WARNING = ["not yet", "offline", "cancel", "refund"];

function systemTone(body: string) {
  const text = body.toLowerCase();
  if (TONE_WARNING.some((word) => text.includes(word))) return "warning";
  if (TONE_SUCCESS.some((word) => text.includes(word))) return "success";
  return "info";
}

function AttachIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>;
}
function SendIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 13-7-4 14-3-5-6-2Z"/><path d="m11 14 7-9"/></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.5 12.75 6 6 9-13.5"/></svg>;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ src, label }: { src?: string | null; label: string }) {
  if (src) return <img className="message-avatar" src={src} alt="" loading="lazy" />;
  return <span className="message-avatar message-avatar-fallback" aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>;
}

/* Poll cadence: fast right after activity, backing off on an idle thread. */
const POLL_HOT = 1200;
const POLL_WARM = 3000;
const POLL_COLD = 8000;
const HOT_WINDOW = 30_000;
const WARM_WINDOW = 120_000;

export function ChatPanel({
  orderId, initialMessages, locked, storeStatus, mode = "customer", adminToken, onChanged,
  customerAvatarUrl, adminAvatarUrl, customerName,
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
}) {
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const jumped = useRef(false);
  const lastActivity = useRef(Date.now());
  const demo = orderId === "demo-order";

  function scrollToBottom(smooth: boolean) {
    const el = logRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  function handleScroll() {
    const el = logRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  useEffect(() => {
    if (!jumped.current) { scrollToBottom(false); jumped.current = true; return; }
    if (pinned.current) scrollToBottom(true);
  }, [messages]);

  /* ---------- polling ---------- */
  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders/${orderId}/messages`, {
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
        cache: "no-store",
      });
      if (!r.ok) return;
      const d = await r.json();
      const next: ChatMessage[] = d.messages ?? [];

      setMessages((prev) => {
        const unconfirmed = prev.filter((m) => m.pending || m.failed);
        const confirmed = prev.filter((m) => !m.pending && !m.failed);
        const unchanged =
          confirmed.length === next.length &&
          confirmed[confirmed.length - 1]?.id === next[next.length - 1]?.id;
        if (unchanged) return prev;                       // no re-render at all
        if (next.length > confirmed.length) lastActivity.current = Date.now();
        return unconfirmed.length ? [...next, ...unconfirmed] : next;
      });
    } catch {}
  }, [orderId, adminToken]);

  useEffect(() => {
    if (demo) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const interval = () => {
      const idle = Date.now() - lastActivity.current;
      if (idle < HOT_WINDOW) return POLL_HOT;
      if (idle < WARM_WINDOW) return POLL_WARM;
      return POLL_COLD;
    };

    const tick = async () => {
      if (!live) return;
      if (typeof document === "undefined" || document.visibilityState === "visible") await poll();
      if (live) timer = setTimeout(tick, interval());
    };
    tick();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      lastActivity.current = Date.now();
      clearTimeout(timer);
      tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [poll, demo]);

  /* ---------- sending ---------- */
  async function deliver(body: string, attachment: File | null, tempId: string) {
    const form = new FormData();
    form.set("body", body);
    if (attachment) form.set("file", attachment);
    try {
      const r = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
        body: form,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Message could not be sent");
      setMessages((prev) => prev.map((m) => (m.id === tempId ? d.message : m)));
      onChanged?.();
      return true;
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setError(e instanceof Error ? e.message : "Message could not be sent");
      return false;
    }
  }

  function makeTemp(body: string, file: File | null): LocalMessage {
    return {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sender: mode,
      body,
      createdAt: new Date().toISOString(),
      attachmentUrl: file ? URL.createObjectURL(file) : null,
      attachmentName: file?.name || null,
      attachmentMime: file?.type || null,
      pending: true,
      retryFile: file,
    };
  }

  function send() {
    const body = text.trim();
    if ((!body && files.length === 0) || locked) return;

    // One file per message — the messages table holds a single attachment, and
    // this is how chat apps behave anyway: three images, three bubbles.
    // A caption rides along with the first attachment.
    const queue = files.length === 0
      ? [{ temp: makeTemp(body, null), body, file: null as File | null }]
      : files.map((file, i) => {
          const b = i === 0 ? body : "";
          return { temp: makeTemp(b, file), body: b, file };
        });

    setMessages((prev) => [...prev, ...queue.map((q) => q.temp)]);
    pinned.current = true;
    lastActivity.current = Date.now();
    setError("");
    setText("");
    setFiles([]);

    if (demo) {
      setMessages((prev) => prev.map((m) => (queue.some((q) => q.temp.id === m.id) ? { ...m, pending: false } : m)));
      return;
    }

    // sequential, so the thread keeps the order you picked them in
    void (async () => { for (const q of queue) await deliver(q.body, q.file, q.temp.id); })();
  }

  function retry(message: LocalMessage) {
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, pending: true, failed: false } : m)));
    setError("");
    void deliver(message.body, message.retryFile || null, message.id);
  }

  /* FileList is a LIVE reference to the input element. React runs the state
     updater during render, so if we clear input.value first the list is already
     empty by the time Array.from() runs. Copy to a real array immediately. */
  function addFiles(picked: File[]) {
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked]);
  }

  const statusText = storeStatus === "online"
    ? "Online, usually replies in a few minutes"
    : storeStatus === "busy"
      ? "Busy, replies may take longer"
      : "Offline, leave a message and we will reply";

  return <section className={mode === "customer" ? "chat-card customer-chat" : "card chat-card admin-chat-card"}>
    {mode === "admin" && <header className="chat-header">
      <div className="chat-identity">
        <img className="chat-avatar" src={adminAvatarUrl || "/pb-avatar.png"} alt="" />
        <div>
          <div className="chat-title">ParadiseBlox Delivery Team</div>
          <div className="chat-sub">
            <span className={`online-dot ${storeStatus === "busy" ? "busy-dot" : storeStatus === "offline" ? "offline-dot" : ""}`} />
            {statusText}
          </div>
        </div>
      </div>
    </header>}

    <div className="chat-log" ref={logRef} onScroll={handleScroll}>
      {mode === "customer" && <div className="chat-guidance" aria-label="Order safety information">
        <div className="system-pill system-pill-info">Keep everything in this chat. Never share your Roblox password.</div>
        <div className="system-pill system-pill-info">Confirm your order only after every item has arrived in-game.</div>
      </div>}

      {messages.length === 0 && <div className="empty-state">
        Send a message when you are ready. ParadiseBlox can read it while the store is offline.
      </div>}

      {messages.map((m, i) => {
        if (m.sender === "system") {
          const tone = systemTone(m.body);
          return <div className="message-row system" key={m.id}>
            <div className={`system-pill system-pill-${tone}`}>
              {tone === "success" && <CheckIcon />}
              <span>{m.body}</span>
            </div>
          </div>;
        }

        const prev = messages[i - 1];
        const next = messages[i + 1];
        const isFirst = prev?.sender !== m.sender;
        const isLast = next?.sender !== m.sender;

        const isMine = m.sender === "customer";
        const name = isMine ? (customerName || "Customer") : "ParadiseBlox";
        const time = timeLabel(m.createdAt);
        const isImage = Boolean(m.attachmentUrl && m.attachmentMime?.startsWith("image/"));
        const isFile = Boolean(m.attachmentUrl && !isImage);

        return <div
          className={["message-row", m.sender, isFirst && "is-first", isLast && "is-last", m.pending && "is-pending", m.failed && "is-failed"].filter(Boolean).join(" ")}
          key={m.id}
        >
          {isLast
            ? <Avatar src={isMine ? customerAvatarUrl : adminAvatarUrl} label={name} />
            : <span className="message-avatar-spacer" aria-hidden="true" />}

          <div className="message-stack">
            {isFirst && <div className="message-meta">{name}<span>{time}</span></div>}
            {m.body && <div className="message-bubble">{m.body}</div>}

            {isImage && <div className="message-attachments">
              <a href={m.attachmentUrl!} target="_blank" rel="noreferrer">
                <img className="message-image" src={m.attachmentUrl!} alt={m.attachmentName || "Attachment"} loading="lazy" />
              </a>
            </div>}

            {isFile && <a className="attachment-link" href={m.attachmentUrl!} target="_blank" rel="noreferrer">
              Open {m.attachmentName || "attachment"}
            </a>}

            {m.failed && <button type="button" className="message-retry" onClick={() => retry(m)}>Failed to send. Tap to retry</button>}
            {isLast && !isFirst && !m.failed && <span className="message-time">{time}</span>}
          </div>
        </div>;
      })}
    </div>

    <div className="chat-compose">
      {files.length > 0 && <div className="attachment-tray">
        {files.map((f, i) => <span className="attachment-chip" key={`${f.name}-${i}`}>
          {f.type.startsWith("image/") && <img src={URL.createObjectURL(f)} alt="" />}
          <span className="attachment-chip-name">{f.name}</span>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((_, x) => x !== i))}>×</button>
        </span>)}
        <button type="button" className="attachment-clear" onClick={() => setFiles([])}>Clear all</button>
      </div>}

      {error && <div className="error-box">{error}</div>}

      <div className="compose-row">
        {!locked && <label className="file-btn" title="Attach images or video">
          <AttachIcon />
          <input
            className="sr-only"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
            onChange={(e) => { const picked = Array.from(e.target.files || []); e.target.value = ""; addFiles(picked); }}
          />
        </label>}
        {locked && <span className="file-btn" aria-hidden="true" />}
        <textarea
          className="compose-input"
          value={text}
          disabled={locked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={locked ? "Chat is closed" : mode === "admin" ? "Message customer" : "Type a message"}
        />
        <button className="send-btn" onClick={send} disabled={locked} aria-label="Send message">
          <SendIcon />
        </button>
      </div>
    </div>
  </section>;
}
