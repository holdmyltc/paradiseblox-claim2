"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, StoreStatus } from "@/lib/types";

function systemTone(body: string) {
  const text = body.toLowerCase();
  if (text.includes("verified") || text.includes("ready") || text.includes("delivering") || text.includes("received")) return "success";
  if (text.includes("not yet") || text.includes("offline")) return "warning";
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

// reference uses 24h "14:59". For 12h "3:41 PM" use:
// toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ src, label }: { src?: string | null; label: string }) {
  if (src) return <img className="message-avatar" src={src} alt="" loading="lazy" />;
  return <span className="message-avatar message-avatar-fallback" aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>;
}

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
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);          // is the reader at the bottom?
  const jumped = useRef(false);         // has the first jump-to-bottom happened?
  const demo = orderId === "demo-order";

  // treat "within 120px of the bottom" as still following the conversation
  function handleScroll() {
    const el = logRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  useEffect(() => {
    if (!jumped.current) {
      // first paint: land at the bottom instantly, no animation
      bottom.current?.scrollIntoView();
      jumped.current = true;
      return;
    }
    if (pinned.current) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (demo) return;
    let live = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/orders/${orderId}/messages`, {
          headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
          cache: "no-store",
        });
        if (!r.ok || !live) return;
        const d = await r.json();
        // only swap state when something actually changed, otherwise every poll
        // hands React a new array and re-triggers the scroll effect
        setMessages((prev) => {
          const next: ChatMessage[] = d.messages ?? [];
          if (prev.length === next.length && prev[prev.length - 1]?.id === next[next.length - 1]?.id) return prev;
          return next;
        });
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => { live = false; clearInterval(timer); };
  }, [orderId, adminToken, demo]);

  async function send() {
    if ((!text.trim() && !file) || sending || locked) return;
    pinned.current = true;   // sending always scrolls you back down
    setSending(true);
    setError("");
    if (demo) {
      setMessages((m) => [...m, {
        id: crypto.randomUUID(),
        sender: mode,
        body: text.trim(),
        createdAt: new Date().toISOString(),
        attachmentUrl: file ? URL.createObjectURL(file) : null,
        attachmentName: file?.name || null,
        attachmentMime: file?.type || null,
      }]);
      setText(""); setFile(null); setSending(false);
      return;
    }
    const body = new FormData();
    body.set("body", text.trim());
    if (file) body.set("file", file);
    const r = await fetch(`/api/orders/${orderId}/messages`, {
      method: "POST",
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
      body,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "Message could not be sent");
    else { setText(""); setFile(null); setMessages((m) => [...m, d.message]); onChanged?.(); }
    setSending(false);
  }

  const statusText = storeStatus === "online"
    ? "Online, usually replies in a few minutes"
    : storeStatus === "busy"
      ? "Busy, replies may take longer"
      : "Offline, leave a message and we will reply";

  return <section className={mode === "customer" ? "chat-card customer-chat" : "card chat-card admin-chat-card"}>
    {mode === "admin" && <header className="chat-header">
      <div className="chat-identity">
        <div className="chat-avatar">PB</div>
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

        // --- run detection: this is the whole trick ---
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const isFirst = prev?.sender !== m.sender;
        const isLast = next?.sender !== m.sender;

        const isMine = m.sender === "customer";
        // label by WHO SENT IT, not whose screen this is — correct in both
        // the customer view and the admin dashboard
        const name = isMine ? (customerName || "Customer") : "ParadiseBlox";
        const time = timeLabel(m.createdAt);
        const isImage = Boolean(m.attachmentUrl && m.attachmentMime?.startsWith("image/"));
        const isFile = Boolean(m.attachmentUrl && !isImage);

        return <div
          className={["message-row", m.sender, isFirst && "is-first", isLast && "is-last"].filter(Boolean).join(" ")}
          key={m.id}
        >
          {isLast
            ? <Avatar src={isMine ? customerAvatarUrl : adminAvatarUrl} label={name} />
            : <span className="message-avatar-spacer" aria-hidden="true" />}

          <div className="message-stack">
            {isFirst && <div className="message-meta">{name}<span>{time}</span></div>}

            {m.body && <div className="message-bubble">{m.body}</div>}

            {/* attachments render OUTSIDE the bubble, like the reference */}
            {isImage && <div className="message-attachments">
              <a href={m.attachmentUrl!} target="_blank" rel="noreferrer">
                <img className="message-image" src={m.attachmentUrl!} alt={m.attachmentName || "Attachment"} loading="lazy" />
              </a>
            </div>}

            {isFile && <a className="attachment-link" href={m.attachmentUrl!} target="_blank" rel="noreferrer">
              Open {m.attachmentName || "attachment"}
            </a>}

            {isLast && !isFirst && <span className="message-time">{time}</span>}
          </div>
        </div>;
      })}

      <div ref={bottom} />
    </div>

    <div className="chat-compose">
      {file && <div className="attachment-notice">
        Attached: {file.name}<button onClick={() => setFile(null)}>Remove</button>
      </div>}
      {error && <div className="error-box">{error}</div>}
      <div className="compose-row">
        {!locked && <label className="file-btn" title="Attach an image or video">
          <AttachIcon />
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
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
        <button className="send-btn" onClick={send} disabled={sending || locked} aria-label="Send message">
          <SendIcon />
        </button>
      </div>
    </div>
  </section>;
}
