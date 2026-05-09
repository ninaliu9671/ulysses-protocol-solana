"use client";

export function SiteFooter() {
  return (
    <footer className="py-6" style={{ borderTop: "1px solid var(--border-low)" }}>
      <div className="max-w-7xl mx-auto px-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-full"
            style={{ border: "1px solid var(--gold)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="var(--gold)" />
              <line x1="12" y1="1" x2="12" y2="5" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="19" x2="12" y2="23" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="1" y1="12" x2="5" y2="12" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="19" y1="12" x2="23" y2="12" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "var(--gold)" }}>ULYSSES</div>
            <div style={{ fontSize: 8, letterSpacing: "0.15em", color: "var(--muted)" }}>PROTOCOL</div>
          </div>
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: 11, color: "var(--muted)" }}>
          <span>Built on Solana · Devnet · v2.1</span>
        </div>
      </div>
    </footer>
  );
}
