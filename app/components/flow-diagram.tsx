"use client";

const STEPS = [
  { label: "Commit", desc: "Pick a discipline mode" },
  { label: "Stake", desc: "Lock SOL behind your vow" },
  { label: "Monitor", desc: "Watcher tracks the chain" },
  { label: "Slash / Claim", desc: "Break it, lose it. Hold, earn it." },
];

export function FlowDiagram() {
  return (
    <div
      className="rounded-xl px-6 py-5 flex items-center justify-between gap-2 flex-wrap"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      {STEPS.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3 flex-1 min-w-[180px]">
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
          <div className="flex flex-col">
            <div
              className="font-bold"
              style={{ color: "var(--gold)", fontSize: 13, letterSpacing: "0.04em" }}
            >
              {s.label}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 11 }}>{s.desc}</div>
          </div>
          {i < STEPS.length - 1 && (
            <span
              className="hidden md:inline"
              style={{ color: "var(--gold)", opacity: 0.5, fontSize: 16 }}
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
