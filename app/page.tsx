import { NavBar } from "./components/nav-bar";
import { HeroSection } from "./components/hero-section";
import { SiteFooter } from "./components/site-footer";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />
      <HeroSection />
      <SiteFooter />
    </div>
  );
}
