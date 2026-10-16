import { Header } from "@/components/header";
import { VerifyForm } from "@/components/verify-form";

export default function HomePage() {
  return (
    <div className="app">
      <Header />
      <main className="home">
        <section className="home-copy">
          <p className="eyebrow">Paradise Blox orders</p>
          <h1 className="home-title">Get your items delivered</h1>
          <p className="home-text">Open your order, link your Roblox account and chat with us while we deliver. Most orders are done in 1 to 20 minutes.</p>
          <ol className="home-steps">
            <li><span>1</span>Enter your order number and checkout email</li>
            <li><span>2</span>Link the Roblox account that gets the items</li>
            <li><span>3</span>Chat with us and tap Received once you have everything</li>
          </ol>
        </section>
        <section className="panel home-card" aria-labelledby="claim-heading">
          <h2 id="claim-heading" className="home-card-title">Open your order</h2>
          <p className="home-card-text">Your order number is in your confirmation email.</p>
          <VerifyForm />
        </section>
      </main>
    </div>
  );
}
