export function HowItWorksSection() {
  const steps = [
    {
      num: "1",
      title: "STAKE",
      desc: "Deposit SOL into the Ulysses vault as collateral for your commitment.",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      ),
    },
    {
      num: "2",
      title: "COMMIT",
      desc: "Choose your commitment type — e.g. NoBuy, NoSell, or AgentGuardian — and set the parameters.",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      num: "3",
      title: "MONITOR",
      desc: "Watchers monitor your on-chain token balance. Violations are detected automatically.",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      num: "4",
      title: "OUTCOME",
      desc: (
        <>
          <span style={{ color: "#ef4444" }}>Break your vow → get slashed.</span>
          <br />
          Keep your vow → earn yield from others&apos; slashes.
        </>
      ),
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-16"
      style={{ borderTop: "1px solid var(--border-low)", borderBottom: "1px solid var(--border-low)" }}
    >
      <div className="max-w-7xl mx-auto px-8">
        {/* Header */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
          <span className="section-label">How It Works</span>
          <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div key={i} className="relative flex flex-col items-start">
              {/* Arrow between steps */}
              {i < steps.length - 1 && (
                <div
                  className="absolute right-0 top-6 hidden md:block"
                  style={{ transform: "translateX(50%)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <div
                className="card-ulysses p-5 w-full flex flex-col gap-4"
                style={{ minHeight: 160 }}
              >
                {/* Number + icon */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{
                      background: "var(--gold-dim)",
                      border: "1px solid var(--border)",
                      color: "var(--gold)",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    {step.num}
                  </div>
                  <div style={{ color: "var(--gold)", opacity: 0.8 }}>{step.icon}</div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.15em",
                      color: "var(--gold)",
                      marginBottom: 6,
                    }}
                  >
                    {step.title}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--muted)" }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
