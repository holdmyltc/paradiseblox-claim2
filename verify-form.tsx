import Link from "next/link";
import { VerifyForm } from "@/components/verify-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClaimAtmosphere } from "@/components/claim-atmosphere";

export default function HomePage() {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return (
    <main className="claim-home-page">
      <ClaimAtmosphere />
      <div className="claim-theme-position"><ThemeToggle /></div>

      <div className="claim-home-stage">
        <aside className="claim-home-art" aria-hidden="true">
          <div className="claim-art-glow claim-art-glow-blue" />
          <div className="claim-art-glow claim-art-glow-orange" />
          <img className="claim-art-logo" src="/paradiseblox-logo.png" alt="" />
          <div className="claim-portal">
            <div className="claim-portal-ring claim-portal-ring-one" />
            <div className="claim-portal-ring claim-portal-ring-two" />
            <div className="claim-portal-core">PB</div>
          </div>
          <div className="claim-floating-tile claim-floating-tile-a"><span>SAB</span></div>
          <div className="claim-floating-tile claim-floating-tile-b"><span>MM2</span></div>
          <div className="claim-floating-tile claim-floating-tile-c"><span>GAG</span></div>
        </aside>

        <section className="claim-card-frame" aria-labelledby="claim-heading">
          <div className="claim-card-premium">
            <img className="claim-card-logo" src="/paradiseblox-logo.png" alt="ParadiseBlox" />
            <div className="claim-card-heading">
              <h1 id="claim-heading">Claim Your Order</h1>
              <p>Enter your order details to begin.</p>
            </div>

            <VerifyForm />

            <div className="claim-card-links">
              <Link href="/history">View previous orders</Link>
              {demo && <Link href="/order/demo">Open order preview</Link>}
            </div>
            <p className="claim-card-hint">Check your email for your order number</p>
          </div>
        </section>
      </div>
    </main>
  );
}
