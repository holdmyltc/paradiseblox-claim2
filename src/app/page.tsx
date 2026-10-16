import Link from "next/link";
import { Header } from "@/components/header";
import { VerifyForm } from "@/components/verify-form";

const STEPS = [
  ["Open your order", "Enter your order number and the email you used at checkout."],
  ["Link your Roblox account", "Type your username and we'll find the right account."],
  ["Chat while we deliver", "Most orders are done in 1 to 20 minutes. Tap Received once you have everything."],
];

export default function HomePage() {
  return (
    <div className="app">
      <Header />
      <main className="home">
        <section className="home-hero">
          <p className="eyebrow">Paradise Blox orders</p>
          <h1 className="home-title">Get your items delivered</h1>
          <p className="home-text">Open your order, link your Roblox account and chat with us while we deliver.</p>
        </section>

        <section className="panel home-card" aria-labelledby="claim-heading">
          <h2 id="claim-heading" className="home-card-title">Open your order</h2>
          <p className="home-card-text">Your order number is in your confirmation email.</p>
          <VerifyForm />
          <p className="home-card-foot">Ordered before? <Link href="/history">See all your orders</Link></p>
        </section>

        <section className="home-how" aria-labelledby="how-heading">
          <h2 id="how-heading" className="home-how-title">How it works</h2>
          <ol className="home-steps">
            {STEPS.map(([title, text], i) => <li key={title}>
              <span className="home-step-num">{i + 1}</span>
              <div><strong>{title}</strong><p>{text}</p></div>
            </li>)}
          </ol>
        </section>

        <ul className="home-trust" aria-label="Why Paradise Blox">
          <li><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span><strong>1 to 20 min</strong>Most deliveries</span></li>
          <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z" /></svg><span><strong>Real person</strong>Live order chat</span></li>
          <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg><span><strong>No passwords</strong>Only your username</span></li>
        </ul>
      </main>
    </div>
  );
}
