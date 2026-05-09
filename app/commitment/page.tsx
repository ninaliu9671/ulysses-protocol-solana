import { NavBar } from "../components/nav-bar";
import { TypesExplainer } from "../components/types-explainer";
import { CreateCommitmentForm } from "../components/create-commitment-form";
import { MyCommitmentsSection } from "../components/my-commitments";
import { SiteFooter } from "../components/site-footer";

export default function CommitmentPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />
      <main className="pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
              Make a Commitment
            </h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Choose a discipline mode. Stake SOL. Stay the course or be slashed.
            </p>
          </div>
          <TypesExplainer />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CreateCommitmentForm />
            <MyCommitmentsSection />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
