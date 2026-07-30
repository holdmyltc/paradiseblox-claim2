import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { OrderPageClient } from "@/components/order-page-client";
import { getOrderByNumber, publicOrder } from "@/lib/orders";
import { readCustomerSession, canAccessOrder } from "@/lib/session";
import { getMessages, getProofs } from "@/lib/messages";
import { DEMO_MESSAGES, DEMO_ORDER, DEMO_PROOFS } from "@/lib/demo";
export default async function OrderPage({params}:{params:Promise<{orderNumber:string}>}){
  const {orderNumber}=await params;
  if(orderNumber==="demo"&&process.env.NEXT_PUBLIC_DEMO_MODE==="true")return <div className="app-shell"><Header account={DEMO_ORDER.roblox}/><main className="page-wrap"><OrderPageClient initialOrder={DEMO_ORDER} initialMessages={DEMO_MESSAGES} initialProofs={DEMO_PROOFS}/></main></div>;
  const order=await getOrderByNumber(orderNumber); if(!order)notFound();
  // A cancelled order has no claim page. 404 rather than redirect: a redirect to
  // the claim form invites the customer to type the same number straight back in.
  if(order.status==="cancelled")notFound();
  const session=await readCustomerSession(); if(!canAccessOrder(session,order.id,order.email))redirect("/");
  const [messages,proofs]=await Promise.all([getMessages(order.id),getProofs(order.id)]);
  const publicData=publicOrder(order);
  return <div className="app-shell"><Header account={publicData.roblox}/><main className="page-wrap"><OrderPageClient initialOrder={publicData} initialMessages={messages} initialProofs={proofs}/></main></div>;
}
