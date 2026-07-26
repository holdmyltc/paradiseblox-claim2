import { VerifyForm } from "@/components/verify-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClaimAtmosphere } from "@/components/claim-atmosphere";

const products = [
  ["raccoon.webp", "product-a"],
  ["unicorn.webp", "product-b"],
  ["golden-dragon.png", "product-c"],
  ["knife.jpg", "product-d"],
  ["ice-bow.jpg", "product-e"],
  ["giraffe.webp", "product-f"],
  ["cat.webp", "product-g"],
  ["red-elephant.webp", "product-h"],
  ["number-nine.webp", "product-i"],
  ["house-nine.webp", "product-j"],
  ["block-pair.webp", "product-k"],
  ["raccoon-alt.png", "product-l"],
  ["unicorn-alt.png", "product-m"],
] as const;

export default function HomePage() {
  return (
    <main className="claim-home-page">
      <ClaimAtmosphere />
      <div className="claim-theme-position"><ThemeToggle /></div>

      <div className="claim-home-stage">
        <aside className="claim-home-art" aria-hidden="true">
          <div className="claim-art-glow claim-art-glow-blue" />
          <div className="claim-art-glow claim-art-glow-orange" />
          <img className="claim-art-logo" src="/paradiseblox-wordmark.png" alt="" />
          <div className="claim-product-cloud">
            <img className="claim-center-icon" src="/brand/paradiseblox-icon.png" alt="" />
            {products.map(([src, className]) => (
              <img key={src} className={`claim-product ${className}`} src={`/products/${src}`} alt="" />
            ))}
          </div>
        </aside>

        <section className="claim-card-frame" aria-labelledby="claim-heading">
          <div className="claim-card-premium">
            <img className="claim-card-logo" src="/paradiseblox-wordmark.png" alt="ParadiseBlox" />
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
