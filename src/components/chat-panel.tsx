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

export function ChatPanel({ orderId, initialMessages, locked, storeStatus, mode = "customer", adminToken, onChanged }: {
  orderId: string; initialMessages: ChatMessage[]; locked: boolean; storeStatus: StoreStatus; mode?: "customer"|"admin"; adminToken?: string | null; onChanged?: () => void;
}) {
  const [messages,setMessages]=useState(initialMessages);
  const [text,setText]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");
  const bottom=useRef<HTMLDivElement>(null);
  const demo = orderId === "demo-order";

  useEffect(()=>{ bottom.current?.scrollIntoView({behavior:"smooth"}); },[messages]);
  useEffect(()=>{
    if(demo) return;
    let live=true;
    const poll=async()=>{ try { const r=await fetch(`/api/orders/${orderId}/messages`, { headers: adminToken ? {Authorization:`Bearer ${adminToken}`} : undefined, cache:"no-store" }); if(r.ok&&live){const d=await r.json();setMessages(d.messages);} } catch{} };
    poll();
    const timer=setInterval(poll,2500);
    return()=>{live=false;clearInterval(timer)};
  },[orderId,adminToken,demo]);

  async function send(){
    if((!text.trim()&&!file)||sending||locked)return;
    setSending(true);
    setError("");
    if(demo){
      setMessages((m)=>[...m,{id:crypto.randomUUID(),sender:mode,body:text.trim()||"Attachment",createdAt:new Date().toISOString(),attachmentUrl:file?URL.createObjectURL(file):null,attachmentName:file?.name||null,attachmentMime:file?.type||null}]);
      setText("");
      setFile(null);
      setSending(false);
      return;
    }
    const body=new FormData();
    body.set("body",text.trim());
    if(file)body.set("file",file);
    const r=await fetch(`/api/orders/${orderId}/messages`,{method:"POST",headers:adminToken?{Authorization:`Bearer ${adminToken}`} : undefined,body});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)setError(d.error||"Message could not be sent");
    else {setText("");setFile(null);setMessages((m)=>[...m,d.message]);onChanged?.();}
    setSending(false);
  }

  const statusText=storeStatus==="online"?"Online, usually replies in a few minutes":storeStatus==="busy"?"Busy, replies may take longer":"Offline, leave a message and we will reply";

  return <section className={`${mode === "customer" ? "chat-card customer-chat" : "card chat-card admin-chat-card"}`}>
    {mode === "admin" && <header className="chat-header"><div className="chat-identity"><div className="chat-avatar">PB</div><div><div className="chat-title">ParadiseBlox Delivery Team</div><div className="chat-sub"><span className={`online-dot ${storeStatus==="busy"?"busy-dot":storeStatus==="offline"?"offline-dot":""}`}/>{statusText}</div></div></div></header>}
    <div className="chat-log">
      {mode === "customer" && <div className="chat-guidance" aria-label="Order safety information">
        <div className="system-pill system-pill-info">Keep everything in this chat. Never share your Roblox password.</div>
        <div className="system-pill system-pill-info">Confirm your order only after every item has arrived in-game.</div>
      </div>}
      {messages.length===0&&<div className="empty-state">Send a message when you are ready. ParadiseBlox can read it while the store is offline.</div>}
      {messages.map((m)=>{
        if(m.sender === "system") return <div className="message-row system" key={m.id}><div className={`system-pill system-pill-${systemTone(m.body)}`}>{m.body}</div></div>;
        return <div className={`message-row ${m.sender}`} key={m.id}>
          <div className="message-stack">
            <div className="message-meta">{m.sender === "customer" ? "You" : "ParadiseBlox"} <span>{new Date(m.createdAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</span></div>
            <div className="message-bubble">{m.body}{m.attachmentUrl&&(m.attachmentMime?.startsWith("image/")?<a href={m.attachmentUrl} target="_blank" rel="noreferrer"><img className="message-image" src={m.attachmentUrl} alt={m.attachmentName||"Attachment"}/></a>:<a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="attachment-link">Open {m.attachmentName||"attachment"}</a>)}</div>
          </div>
        </div>;
      })}
      <div ref={bottom}/>
    </div>
    {locked?<div className="read-only">This order is complete. The chat and delivery record are saved as read-only proof.</div>:<div className="chat-compose">
      {file&&<div className="attachment-notice">Attached: {file.name}<button onClick={()=>setFile(null)}>Remove</button></div>}
      {error&&<div className="error-box">{error}</div>}
      <div className="compose-row">
        <label className="file-btn" title="Attach an image or video"><AttachIcon/><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4" onChange={(e)=>setFile(e.target.files?.[0]||null)}/></label>
        <textarea className="compose-input" value={text} onChange={(e)=>setText(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder={mode==="admin"?"Message customer":"Type a message"}/>
        <button className="send-btn" onClick={send} disabled={sending} aria-label="Send message"><SendIcon/></button>
      </div>
    </div>}
  </section>;
}
