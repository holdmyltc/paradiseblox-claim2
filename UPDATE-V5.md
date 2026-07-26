import Link from "next/link";
import { SUPPORT_URL } from "@/lib/config";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({ compact = false }: { compact?: boolean }) {
  return (
    <header className="nova-header">
      <div className="nova-header-inner">
        <Link className="nova-brand" href="/" aria-label="ParadiseBlox claim home">
          <img src="/paradiseblox-logo.png" alt="ParadiseBlox" />
        </Link>
        <nav className="nova-header-actions" aria-label="Claim navigation">
          {!compact && <a href={SUPPORT_URL} target="_blank" rel="noreferrer">Support</a>}
          <Link href="/history">Order history</Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
