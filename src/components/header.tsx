import Link from "next/link";
import { SUPPORT_URL } from "@/lib/config";
import { ThemeToggle } from "@/components/theme-toggle";
import type { RobloxProfile } from "@/lib/types";

/**
 * `account` renders the verified-Roblox chip in the header, the way the
 * reference does. It used to live inside the order summary row, where on a
 * 390px screen it squeezed the order number onto two lines.
 *
 * The history link carries two labels: the full one on desktop, a short one on
 * phones. Truncating with an ellipsis produced "Order hist..." which read as a
 * bug rather than a design choice.
 */
export function Header({ compact = false, account }: { compact?: boolean; account?: RobloxProfile | null }) {
  return (
    <header className="nova-header">
      <div className="nova-header-inner">
        <Link className="nova-brand" href="/" aria-label="ParadiseBlox claim home">
          <img src="/paradiseblox-wordmark.png" alt="ParadiseBlox" width={1277} height={241} />
        </Link>

        <nav className="nova-header-actions" aria-label="Claim navigation">
          {account && (
            <span className="nova-chip" aria-label="Verified Roblox account">
              {account.avatarUrl
                ? <img className="nova-chip-avatar" src={account.avatarUrl} alt="" />
                : <span className="nova-chip-avatar nova-chip-fallback">{account.displayName.slice(0, 1).toUpperCase()}</span>}
              <span className="nova-chip-copy">
                <span className="nova-chip-name">{account.displayName}</span>
                <span className="nova-chip-sub">@{account.username}</span>
              </span>
            </span>
          )}

          {!compact && (
            <a className="nova-support-link" href={SUPPORT_URL} target="_blank" rel="noreferrer">Support</a>
          )}
          <Link href="/history">
            <span className="nav-full">Order history</span>
            <span className="nav-short">History</span>
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
