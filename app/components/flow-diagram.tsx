"use client";

const STEPS = [
  { label: "Commit", desc: "Pick a discipline mode" },
  { label: "Stake", desc: "Lock SOL behind your vow" },
  { label: "Monitor", desc: "Watcher tracks the chain" },
  { label: "Slash / Claim", desc: "Break it, lose it. Hold it, earn it." },
];

function Step({ index, label, desc }: { index: number; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 justify-self-center">
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
        {index}
      </div>
      <div className="flex flex-col">
        <div
          className="font-bold whitespace-nowrap"
          style={{ color: "var(--gold)", fontSize: 13, letterSpacing: "0.04em" }}
        >
          {label}
        </div>
        <div
          className="whitespace-nowrap"
          style={{ color: "var(--muted)", fontSize: 11 }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div
      className="justify-self-center"
      style={{ color: "var(--gold)", opacity: 0.5, fontSize: 18 }}
    >
      →
    </div>
  );
}

export function FlowDiagram() {
  // Grid: step | arrow | step | arrow | step | arrow | step
  // Steps get equal flex (1fr); arrows take only their natural width (auto).
  return (
    <div
      className="rounded-xl px-6 py-5 hidden md:grid items-center gap-4"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        gridTemplateColumns: "1fr auto 1fr auto 1fr auto 1fr",
      }}
    >
      <Step index={1} label={STEPS[0].label} desc={STEPS[0].desc} />
      <Arrow />
      <Step index={2} label={STEPS[1].label} desc={STEPS[1].desc} />
      <Arrow />
      <Step index={3} label={STEPS[2].label} desc={STEPS[2].desc} />
      <Arrow />
      <Step index={4} label={STEPS[3].label} desc={STEPS[3].desc} />
    </div>
  );
}
