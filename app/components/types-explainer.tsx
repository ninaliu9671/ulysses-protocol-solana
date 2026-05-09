"use client";

import { COMMITMENT_TYPES } from "../lib/commitment-types";

const CARDS: Record<string, { desc: string; detail: string }> = {
  NoSell: {
    desc: "Lock in current balance as a floor. Sell below it → slashed.",
    detail: "Per token. Strongest hold mode.",
  },
  HoldAbove: {
    desc: "Choose a custom floor (≤ baseline). Drop below → slashed.",
    detail: "Per token. Lighter than NoSell.",
  },
  NoTradeWindow: {
    desc: "Define a UTC window where you must not sign any tx.",
    detail: "Wallet-scoped. Multi-window via nonce.",
  },
  AgentGuardian: {
    desc: "Only a guardian key may move funds out of your wallet.",
    detail: "Wallet-exclusive. Strongest mode.",
  },
};

export function TypesExplainer() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {COMMITMENT_TYPES.map((t) => {
        const c = CARDS[t.key];
        return (
          <div
            key={t.key}
            className="rounded-xl p-4"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <div className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: "var(--gold)" }}>
              <span className="text-lg">{t.emoji}</span>
              {t.label}
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>{c.desc}</div>
            <div className="text-[10px] mt-2" style={{ color: "var(--muted)" }}>{c.detail}</div>
          </div>
        );
      })}
    </div>
  );
}
