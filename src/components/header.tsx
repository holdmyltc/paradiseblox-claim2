import Link from "next/link";
import { SUPPORT_URL } from "@/lib/config";

export function Header({ compact = false }: { compact?: boolean }) {
  return <>
    <div className="top-strip">
      <span>Need help with your order?</span>
      <a href={SUPPORT_URL} target="_blank" rel="noreferrer">Contact us</a>
    </div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="ParadiseBlox home">
        <img className="brand-logo" src="/paradiseblox-logo.png" alt="ParadiseBlox" />
      </Link>
      {!compact && <nav className="header-actions" aria-label="Claim site navigation">
        <a className="header-text-link" href={SUPPORT_URL} target="_blank" rel="noreferrer">Support</a>
        <Link className="header-link" href="/history">Order history</Link>
      </nav>}
    </header>
  </>;
}
