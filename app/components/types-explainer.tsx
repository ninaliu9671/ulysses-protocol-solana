"use client";

const CARDS = [
  {
    title: "NoSell",
    desc: "Lock in current balance as a floor. Sell below it → slashed.",
    detail: "Per token. Strongest hold mode.",
  },
  {
    title: "HoldAbove",
    desc: "Choose a custom floor (≤ baseline). Drop below → slashed.",
    detail: "Per token. Lighter than NoSell.",
  },
  {
    title: "NoTradeWindow",
    desc: "Define a UTC window where you must not sign any tx.",
    detail: "Wallet-scoped. Multi-window via nonce.",
  },
  {
    title: "AgentGuardian",
    desc: "Only a guardian key may move funds out of your wallet.",
    detail: "Wallet-exclusive. Strongest mode.",
  },
];

export function TypesExplainer() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {CARDS.map((c) => (
        <div
          key={c.title}
          className="rounded-xl p-4"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div className="text-sm font-bold mb-1" style={{ color: "var(--gold)" }}>{c.title}</div>
          <div className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>{c.desc}</div>
          <div className="text-[10px] mt-2" style={{ color: "var(--muted)" }}>{c.detail}</div>
        </div>
      ))}
    </div>
  );
}
