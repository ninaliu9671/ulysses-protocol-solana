"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// GitHub-style slugger: lowercase, strip non-alphanumeric/space/hyphen,
// collapse spaces to hyphens. Mirrors react-markdown default heading id
// generation so anchor links work.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

type TocItem = { level: 2 | 3; text: string; id: string };

function buildToc(markdown: string): TocItem[] {
  const out: TocItem[] = [];
  for (const raw of markdown.split("\n")) {
    const m2 = raw.match(/^##\s+(.+?)\s*$/);
    if (m2 && !raw.startsWith("###")) {
      const text = m2[1].trim();
      out.push({ level: 2, text, id: slugify(text) });
      continue;
    }
    const m3 = raw.match(/^###\s+(.+?)\s*$/);
    if (m3) {
      const text = m3[1].trim();
      out.push({ level: 3, text, id: slugify(text) });
    }
  }
  return out;
}

export function DocsView({ markdown }: { markdown: string }) {
  const toc = useMemo(() => buildToc(markdown), [markdown]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Highlight TOC entry whose section is currently in view.
  // Use scroll listener over IntersectionObserver because IO doesn't fire
  // for headings already-past on initial mount or after hash navigation.
  useEffect(() => {
    const ids = toc.map((t) => t.id);

    function update() {
      const headings = ids
        .map((id) => ({ id, el: document.getElementById(id) }))
        .filter((x): x is { id: string; el: HTMLElement } => !!x.el);
      if (headings.length === 0) return;

      // Activation line ~120px below viewport top (clears the fixed nav).
      const ACTIVATION_Y = 120;
      let current: string | null = headings[0].id;
      for (const h of headings) {
        const top = h.el.getBoundingClientRect().top;
        if (top - ACTIVATION_Y <= 0) current = h.id;
        else break;
      }
      setActiveId(current);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [toc]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
      {/* TOC */}
      <aside className="order-2 lg:order-1">
        <div className="lg:sticky lg:top-24">
          <div
            className="text-[11px] font-bold mb-3"
            style={{ color: "var(--gold)", letterSpacing: "0.15em" }}
          >
            ON THIS PAGE
          </div>
          <nav className="flex flex-col gap-1.5 text-sm">
            {toc.map((item) => {
              const active = activeId === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="transition-colors"
                  style={{
                    paddingLeft: item.level === 3 ? 14 : 0,
                    color: active ? "var(--gold)" : "var(--muted)",
                    fontWeight: active ? 700 : 400,
                    fontSize: item.level === 3 ? 12 : 13,
                    borderLeft: item.level === 3 && active ? "2px solid var(--gold)" : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = "var(--foreground)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = "var(--muted)";
                  }}
                >
                  {item.text}
                </a>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Body */}
      <article className="order-1 lg:order-2 docs-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => {
              const text = String(children);
              return (
                <h1
                  id={slugify(text)}
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 36,
                    fontWeight: 800,
                    color: "var(--foreground)",
                    marginBottom: 24,
                    scrollMarginTop: 96,
                  }}
                >
                  {children}
                </h1>
              );
            },
            h2: ({ children }) => {
              const text = String(children);
              return (
                <h2
                  id={slugify(text)}
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 24,
                    fontWeight: 700,
                    color: "var(--gold)",
                    marginTop: 40,
                    marginBottom: 16,
                    scrollMarginTop: 96,
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 8,
                  }}
                >
                  {children}
                </h2>
              );
            },
            h3: ({ children }) => {
              const text = String(children);
              return (
                <h3
                  id={slugify(text)}
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--foreground)",
                    marginTop: 28,
                    marginBottom: 12,
                    scrollMarginTop: 96,
                  }}
                >
                  {children}
                </h3>
              );
            },
            p: ({ children }) => (
              <p style={{ color: "var(--foreground)", lineHeight: 1.75, fontSize: 14, marginBottom: 14 }}>
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul style={{ color: "var(--foreground)", lineHeight: 1.75, fontSize: 14, marginBottom: 14, paddingLeft: 22, listStyle: "disc" }}>
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol style={{ color: "var(--foreground)", lineHeight: 1.75, fontSize: 14, marginBottom: 14, paddingLeft: 22, listStyle: "decimal" }}>
                {children}
              </ol>
            ),
            li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
            blockquote: ({ children }) => (
              <blockquote
                style={{
                  borderLeft: "2px solid var(--gold)",
                  paddingLeft: 14,
                  margin: "16px 0",
                  color: "var(--muted)",
                  fontStyle: "italic",
                  fontSize: 14,
                }}
              >
                {children}
              </blockquote>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <code
                    className={className}
                    style={{
                      display: "block",
                      background: "var(--input)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: 12,
                      fontSize: 12,
                      fontFamily: "var(--font-geist-mono)",
                      color: "var(--foreground)",
                      overflowX: "auto",
                      lineHeight: 1.6,
                    }}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code
                  style={{
                    background: "var(--input)",
                    padding: "2px 5px",
                    borderRadius: 3,
                    fontSize: 12,
                    fontFamily: "var(--font-geist-mono)",
                    color: "var(--gold)",
                  }}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <pre style={{ marginBottom: 16 }}>{children}</pre>,
            hr: () => <hr style={{ borderColor: "var(--border)", margin: "32px 0" }} />,
            a: ({ href, children }) => (
              <a href={href} style={{ color: "var(--gold)", textDecoration: "underline" }}>
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--gold)",
                  fontSize: 11,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
              >
                {children}
              </td>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
