import { NavBar } from "../components/nav-bar";
import { LeaderboardSection } from "../components/leaderboard-section";
import { SirenGraveyardSection } from "../components/siren-graveyard";
import { SiteFooter } from "../components/site-footer";

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />
      <main className="pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
              Hall of Masts
            </h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Stakers ranked by yield earned from others&apos; failures.
            </p>
          </div>
          <LeaderboardSection />
          <SirenGraveyardSection limit={50} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
