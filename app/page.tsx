"use client";

import { NavBar } from "./components/nav-bar";
import { HeroSection } from "./components/hero-section";
import { HowItWorksSection } from "./components/how-it-works-section";
import { CreateCommitmentForm } from "./components/create-commitment-form";
import { MyCommitmentsSection } from "./components/my-commitments";
import { LeaderboardSection } from "./components/leaderboard-section";
import { SirenGraveyardSection } from "./components/siren-graveyard";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />

      {/* Hero */}
      <HeroSection />

      {/* How It Works */}
      <HowItWorksSection />

      {/* App section: Commitment Form + My Commitments */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CreateCommitmentForm />
            <MyCommitmentsSection />
          </div>
        </div>
      </section>

      {/* Leaderboard + Siren Graveyard */}
      <section id="leaderboard" className="pb-16">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LeaderboardSection />
            <SirenGraveyardSection />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-6"
        style={{ borderTop: "1px solid var(--border-low)" }}
      >
        <div className="max-w-7xl mx-auto px-8 flex flex-wrap items-center justify-between gap-4">
          {/* Logo */}
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

          {/* Center */}
          <div className="flex items-center gap-4" style={{ fontSize: 11, color: "var(--muted)" }}>
            <div className="flex items-center gap-1.5">
              <SolanaLogo />
              <span>Built on Solana</span>
            </div>
            <div style={{ width: 1, height: 14, background: "var(--border)" }} />
            <div className="flex items-center gap-1.5">
              <EyeIcon />
              <span>Security by Watchers</span>
            </div>
          </div>

          {/* Socials */}
          <div className="flex items-center gap-4">
            {[
              {
                label: "Twitter",
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                ),
              },
              {
                label: "Discord",
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.1.135 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                  </svg>
                ),
              },
              {
                label: "GitHub",
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                ),
              },
            ].map((s) => (
              <a
                key={s.label}
                href="#"
                style={{ color: "var(--muted)", transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                aria-label={s.label}
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function SolanaLogo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--muted)">
      <path d="M3.9 15.9L6.5 13h14.1c.3 0 .5.4.3.6l-2.6 2.9c-.1.1-.2.1-.3.1H4.2c-.3 0-.5-.3-.3-.7z" />
      <path d="M3.9 8.1L6.5 11h14.1c.3 0 .5-.4.3-.6L18.3 7.5c-.1-.1-.2-.1-.3-.1H4.2c-.3 0-.5.3-.3.7z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
