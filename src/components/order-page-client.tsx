"use client";
import { useEffect, useState } from "react";
import type { ChatMessage, DeliveryProof, PublicOrder, RobloxProfile } from "@/lib/types";
import { ChatPanel } from "@/components/chat-panel";
import { OrderOverview } from "@/components/order-overview";
import { StatusSteps } from "@/components/status-steps";

export function OrderPageClient({ initialOrder, initialMessages, initialProofs }: { initialOrder:PublicOrder; initialMessages:ChatMessage[]; initialProofs:DeliveryProof[] }) {
  const [order,setOrder]=useState(initialOrder);
  const [proofs,setProofs]=useState(initialProofs);
  const [candidate,setCandidate]=useState<RobloxProfile|null>(null);
  const [username,setUsername]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const demo=order.id==="demo-order";

  useEffect(()=>{
    if(order.id==="demo-order")return;
    let live=true;
    const poll=async()=>{try{const r=await fetch(`/api/orders/${order.id}`,{cache:"no-store"});if(r.ok&&live){const d=await r.json();setOrder(d.order);setProofs(d.proofs)}}catch{}};
    poll();
    const t=setInterval(poll,3000);
    return()=>{live=false;clearInterval(t)};
  },[order.id]);

  async function lookup(){
    setLoading(true);
    setError("");
    try{const r=await fetch("/api/roblox/lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username})});const d=await r.json();if(!r.ok)throw new Error(d.error);setCandidate(d.profile);}catch(e){setError(e instanceof Error?e.message:"Lookup failed")}
    setLoading(false);
  }

  async function confirm(){
    if(!candidate)return;
    setLoading(true);
    if(demo){setOrder({...order,roblox:candidate,status:order.status==="paid"?"in_progress":order.status});setCandidate(null);setLoading(false);return;}
    const r=await fetch(`/api/orders/${order.id}/roblox`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(candidate)});
    const d=await r.json();
    if(r.ok)setOrder(d.order);else setError(d.error||"Could not save Roblox account");
    setLoading(false);
  }

  async function customerAction(action:"confirm"|"not_yet") {
    const r=await fetch(`/api/orders/${order.id}/confirm`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
    const d=await r.json();
    if(r.ok)setOrder(d.order);else setError(d.error||"Could not update order");
  }

  if(!order.roblox) return <div className="order-layout fade-up">
    <section className="card roblox-link-card">
      <div className="link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg></div>
      <h1 className="section-title">Link your Roblox account</h1>
      <p className="section-copy">Enter your Roblox username so we can verify the account for this order.</p>
      {candidate?<div>
        <div className="roblox-confirm-card">{candidate.avatarUrl&&<img className="roblox-confirm-avatar" src={candidate.avatarUrl} alt="Roblox avatar"/>}<div><strong>{candidate.displayName}</strong><div className="small">@{candidate.username}</div><div className="small">User ID {candidate.userId}</div></div></div>
        <div className="button-row"><button className="btn btn-soft" onClick={()=>setCandidate(null)}>Go back</button><button className="btn btn-blue" onClick={confirm} disabled={loading}>Yes, this is my account</button></div>
      </div>:<>
        <div className="field"><label>Roblox username</label><input className="input" value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Your Roblox username"/></div>
        {error&&<div className="error-box">{error}</div>}
        <button className="btn btn-blue btn-block" onClick={lookup} disabled={!username.trim()||loading}>{loading?<span className="spinner"/>:"Find account"}</button>
      </>}
    </section>
  </div>;

  return <div className="order-layout fade-up">
    <section className="delivery-shell">
      <StatusSteps status={order.status}/>
      <OrderOverview order={order} proofs={proofs}/>

      {order.status==="delivered"&&<section className="confirmation-panel">
        <div><h2>Did you receive your complete order?</h2><p>Check every item in-game before you confirm.</p></div>
        {error&&<div className="error-box">{error}</div>}
        <div className="confirmation-actions"><button className="btn btn-confirm" onClick={()=>customerAction("confirm")}>Yes, I received everything</button><button className="btn btn-soft" onClick={()=>customerAction("not_yet")}>Not yet</button></div>
      </section>}

      <ChatPanel
  orderId={order.id}
  initialMessages={initialMessages}
  locked={order.chatLocked}
  storeStatus={order.storeStatus}
  customerAvatarUrl={order.roblox?.avatarUrl}
  customerName={order.roblox?.username}
  adminAvatarUrl="/pb-avatar.png"
/>
    </section>

    {(order.status === "delivered" || order.status === "completed") && <section className="card review-panel">
      <div><div className="trustpilot-label">Trustpilot</div><h2>How was your experience?</h2><p>Your review helps other customers learn about ParadiseBlox.</p></div>
      <a className="btn trustpilot-btn" href={order.trustpilotUrl} target="_blank" rel="noreferrer">Leave a review</a>
    </section>}
  </div>;
}
