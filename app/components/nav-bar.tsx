"use client";

import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

export function NavBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4"
      style={{
        background: "rgba(12, 11, 9, 0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(201,169,110,0.1)",
      }}
    >
      {/* Logo */}
      <a href="/" className="flex items-center gap-3 select-none">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ border: "1.5px solid var(--gold)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" fill="var(--gold)" />
            <line x1="12" y1="1" x2="12" y2="5" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="19" x2="12" y2="23" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="1" y1="12" x2="5" y2="12" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="19" y1="12" x2="23" y2="12" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="4.22" y1="4.22" x2="7.05" y2="7.05" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="16.95" y1="16.95" x2="19.78" y2="19.78" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="4.22" y1="19.78" x2="7.05" y2="16.95" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="16.95" y1="7.05" x2="19.78" y2="4.22" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="leading-tight">
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "var(--gold)" }}>ULYSSES</div>
          <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", color: "var(--muted)" }}>PROTOCOL</div>
        </div>
      </a>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-8">
        {[
          { label: "Home", href: "/" },
          { label: "Commitment", href: "/commitment" },
          { label: "Leaderboard", href: "/leaderboard" },
          { label: "Docs", href: "/docs" },
        ].map((item) => {
          const active = isActive(item.href);
          return (
            <a
              key={item.label}
              href={item.href}
              style={{
                fontSize: 13,
                color: active ? "var(--gold)" : "var(--muted)",
                fontWeight: active ? 700 : 500,
                transition: "color 0.15s",
                paddingBottom: 4,
                borderBottom: active ? "1.5px solid var(--gold)" : "1.5px solid transparent",
                textShadow: active ? "0 0 12px rgba(201,169,110,0.4)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = "var(--muted)";
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(201,169,110,0.08)",
            border: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: "0.05em",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6" }} />
          devnet
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
