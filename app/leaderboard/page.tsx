import { NavBar } from "../components/nav-bar";
import { LeaderboardSection } from "../components/leaderboard-section";
import { SirenGraveyardSection } from "../components/siren-graveyard";
import { SiteFooter } from "../components/site-footer";

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />
      <main className="pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LeaderboardSection />
            <SirenGraveyardSection limit={50} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
