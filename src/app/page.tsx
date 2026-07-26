import { VerifyForm } from "@/components/verify-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClaimAtmosphere } from "@/components/claim-atmosphere";

// reference shows exactly two tiles: upper-right, lower-left
const tiles = [
  { src: "/raccoon.webp", position: "product-a" },
  { src: "/giraffe.webp", position: "product-b" },
] as const;

export default function HomePage() {
  return (
    <main className="claim-home-page">
      <ClaimAtmosphere />

      <div className="claim-theme-position">
        <ThemeToggle />
      </div>

      <div className="claim-home-stage">
        <aside className="claim-home-art" aria-hidden="true">
          <div className="claim-art-glow claim-art-glow-blue" />
          <div className="claim-art-glow claim-art-glow-orange" />

          <img
            className="claim-mascot"
            src="/paradiseblox-mascot.png"
            alt=""
            width={840}
            height={1180}
          />

          {tiles.map((tile) => (
            <img
              key={tile.src}
              className={`claim-product ${tile.position}`}
              src={tile.src}
              alt=""
              width={56}
              height={56}
            />
          ))}
        </aside>

        <section className="claim-card-frame" aria-labelledby="claim-heading">
          <div className="claim-card-premium">
            <div className="claim-card-heading">
              <h1 id="claim-heading">Claim Your Order</h1>
              <p>Enter your order details to begin.</p>
            </div>
            <VerifyForm />
            <p className="claim-card-hint">Check your email for your order number</p>
          </div>
        </section>
      </div>
    </main>
  );
}
