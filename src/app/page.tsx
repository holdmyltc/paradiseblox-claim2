import Link from "next/link";
import { Header } from "@/components/header";
import { VerifyForm } from "@/components/verify-form";

export default function HomePage() {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  return <div className="app-shell"><Header/><main className="page-wrap">
    <section className="card hero"><span className="eyebrow">ParadiseBlox order delivery</span><h1>Claim your order and chat with ParadiseBlox.</h1><p>Verify your order, confirm your Roblox account and keep the full delivery chat in one place.</p></section>
    <section className="verify-grid">
      <div className="card form-card"><h2 className="section-title">Verify your order</h2><p className="section-copy">Enter your order ID and checkout email. No email code is needed for the order you are claiming now.</p><VerifyForm/>{demo&&<Link className="btn btn-soft btn-block" href="/order/demo" style={{marginTop:10}}>Open design preview</Link>}</div>
      <div className="card info-card"><h2 className="section-title">How it works</h2><div className="feature-list"><div className="feature"><div className="feature-icon">1</div><div><strong>Verify your Roblox account</strong><span>Check the avatar, username and user ID before delivery starts.</span></div></div><div className="feature"><div className="feature-icon">2</div><div><strong>Chat with ParadiseBlox</strong><span>Use one chat for every game and item in your order.</span></div></div><div className="feature"><div className="feature-icon">3</div><div><strong>Keep your delivery record</strong><span>Completed orders stay available as a read-only receipt.</span></div></div></div><Link href="/history" className="btn btn-blue btn-block" style={{marginTop:22}}>View previous orders</Link></div>
    </section>
  </main></div>;
}
