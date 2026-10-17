import Link from "next/link";
import { SUPPORT_URL } from "@/lib/config";
import type { RobloxProfile } from "@/lib/types";
import { Avatar as RobloxAvatar } from "@/components/avatar";

export function Header({ account }: { compact?: boolean; account?: RobloxProfile | null }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href="/" aria-label="Paradise Blox orders home">
          <img src="/pb-wordmark.png" alt="Paradise Blox" width={1115} height={169} />
        </Link>
        <nav className="topbar-nav" aria-label="Orders">
          {account && <span className="me" aria-label="Linked Roblox account">
            <RobloxAvatar src={account.avatarUrl} name={account.displayName} fallbackClassName="me-fallback" />
            <span className="me-name">@{account.username}</span>
          </span>}
          <Link className="topbar-link" href="/history">My orders</Link>
          <a className="topbar-link" href={SUPPORT_URL} target="_blank" rel="noreferrer">Help</a>
        </nav>
      </div>
    </header>
  );
}
