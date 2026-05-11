"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NavBar } from "./components/nav-bar";
import { HeroSection } from "./components/hero-section";
import { FlowDiagram } from "./components/flow-diagram";
import { CreateCommitmentForm } from "./components/create-commitment-form";
import { MyCommitmentsSection } from "./components/my-commitments";
import { LeaderboardSection } from "./components/leaderboard-section";
import { SirenGraveyardSection } from "./components/siren-graveyard";
import { SiteFooter } from "./components/site-footer";

function AppShell() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "home";

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />

      {/* HOME */}
      <div style={{ display: tab === "home" ? "block" : "none" }}>
        <HeroSection />
      </div>

      {/* COMMITMENT */}
      <div style={{ display: tab === "commitment" ? "block" : "none" }}>
        <main className="pt-24 pb-12">
          <div className="max-w-7xl mx-auto px-8 space-y-6">
            <div>
              <h1
                className="text-3xl font-bold mb-2"
                style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}
              >
                Make a Commitment
              </h1>
              <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
                Choose your vow. Stake SOL behind it. Stay the course or be slashed.
              </p>
              <FlowDiagram />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CreateCommitmentForm />
              <MyCommitmentsSection />
            </div>
          </div>
        </main>
      </div>

      {/* LEADERBOARD */}
      <div style={{ display: tab === "leaderboard" ? "block" : "none" }}>
        <main className="pt-24 pb-12">
          <div className="max-w-7xl mx-auto px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <LeaderboardSection />
              <SirenGraveyardSection limit={50} />
            </div>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
