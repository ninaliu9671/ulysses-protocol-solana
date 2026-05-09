import { readFileSync } from "fs";
import path from "path";
import { NavBar } from "../components/nav-bar";
import { SiteFooter } from "../components/site-footer";
import { DocsView } from "./docs-view";

export default function DocsPage() {
  const md = readFileSync(path.join(process.cwd(), "app/docs/DOCS.md"), "utf8");
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />
      <main className="pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-8">
          <DocsView markdown={md} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
