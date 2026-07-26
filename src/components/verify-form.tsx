"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function VerifyForm() {
  const [orderId,setOrderId]=useState("");const[email,setEmail]=useState("");const[error,setError]=useState("");const[loading,setLoading]=useState(false);const router=useRouter();
  async function submit(e:React.FormEvent){e.preventDefault();setLoading(true);setError("");const r=await fetch("/api/orders/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId,email})});const d=await r.json().catch(()=>({}));if(r.ok)router.push(`/order/${encodeURIComponent(d.order.orderNumber.replace("#",""))}`);else setError(d.error||"Order could not be verified");setLoading(false)}
  return <form onSubmit={submit}>
    <div className="field"><label>Order ID</label><input className="input" value={orderId} onChange={(e)=>setOrderId(e.target.value)} placeholder="e.g. #4821" autoComplete="off"/></div>
    <div className="field"><label>Email used at checkout</label><input className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></div>
    {error&&<div className="error-box">{error}</div>}
    <button className="btn btn-primary btn-block" disabled={loading||!orderId.trim()||!email.trim()}>{loading?<span className="spinner"/>:"Verify order"}</button>
  </form>;
}
