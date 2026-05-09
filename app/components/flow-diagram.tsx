"use client";

const STEPS = [
  { label: "Commit", desc: "Pick a discipline mode" },
  { label: "Stake", desc: "Lock SOL behind your vow" },
  { label: "Monitor", desc: "Watcher tracks the chain" },
  { label: "Slash / Claim", desc: "Break it, lose it. Hold it, earn it." },
];

export function FlowDiagram() {
  return (
    <div
      className="rounded-xl px-6 py-5"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-stretch">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center flex-1">
            {/* Step content */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                style={{
                  border: "1px solid var(--gold)",
                  color: "var(--gold)",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "var(--font-serif)",
                }}
              >
                {i + 1}
              </div>
              <div className="flex flex-col min-w-0">
                <div
                  className="font-bold whitespace-nowrap"
                  style={{ color: "var(--gold)", fontSize: 13, letterSpacing: "0.04em" }}
                >
                  {s.label}
                </div>
                <div
                  className="whitespace-nowrap"
                  style={{ color: "var(--muted)", fontSize: 11 }}
                >
                  {s.desc}
                </div>
              </div>
            </div>
            {/* Arrow between steps — its own flex slot, fixed width, centered */}
            {i < STEPS.length - 1 && (
              <div
                className="hidden md:flex items-center justify-center shrink-0"
                style={{ width: 32, color: "var(--gold)", opacity: 0.5, fontSize: 18 }}
              >
                →
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
