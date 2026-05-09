// Single source of truth for commitment-type display metadata.
// Add a new type here once and it propagates to form, my-commitments, leaderboard, legend.

export type CommitmentTypeKey = "NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian";

export type CommitmentTypeMeta = {
  key: CommitmentTypeKey;
  emoji: string;
  short: string; // 2-letter abbreviation, used in dense tables
  label: string; // full name
  tagline: string; // one-line description for dropdown
};

export const COMMITMENT_TYPES: CommitmentTypeMeta[] = [
  { key: "NoSell",        emoji: "🔒", short: "NS", label: "NoSell",        tagline: "never sell below current balance" },
  { key: "HoldAbove",     emoji: "📈", short: "HA", label: "HoldAbove",     tagline: "hold above a chosen floor" },
  { key: "NoTradeWindow", emoji: "⏰", short: "NT", label: "NoTradeWindow", tagline: "no trades in a UTC window" },
  { key: "AgentGuardian", emoji: "🛡", short: "AG", label: "AgentGuardian", tagline: "only an agent key may move funds" },
];

export const TYPE_BY_KEY: Record<CommitmentTypeKey, CommitmentTypeMeta> = Object.fromEntries(
  COMMITMENT_TYPES.map((t) => [t.key, t]),
) as Record<CommitmentTypeKey, CommitmentTypeMeta>;
