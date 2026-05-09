"use client";

// SVG state machine for §5.1.
// Active --> {Unlockable, Slashed, Cancelled, (still Active)}
// Unlockable --> Claimed; Slashed/Cancelled --> forfeit to reward pool.

export function StateDiagram() {
  const gold = "var(--gold)";
  const fg = "var(--foreground)";
  const muted = "var(--muted)";
  const bg = "var(--input)";
  const danger = "#fca5a5";
  const win = "#86efac";

  return (
    <div
      className="my-6 rounded-xl p-6 overflow-x-auto"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <svg viewBox="0 0 760 360" className="w-full h-auto" style={{ minWidth: 600 }}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill={gold} opacity={0.7} />
          </marker>
        </defs>

        {/* Top: Active */}
        <Box x={310} y={20} w={140} h={50} label="Active" sub="duration not elapsed" stroke={gold} fill={bg} fg={fg} />

        {/* 4 branches: down arrows from Active */}
        <ArrowLine x1={380} y1={70} x2={120} y2={130} />
        <ArrowLine x1={380} y1={70} x2={300} y2={130} />
        <ArrowLine x1={380} y1={70} x2={460} y2={130} />
        <ArrowLine x1={380} y1={70} x2={640} y2={130} />

        {/* Row 2: 4 outcome boxes */}
        <Box x={50} y={130} w={140} h={70} label="Unlockable" sub="expired, not yet claimed" stroke={gold} fill={bg} fg={fg} />
        <Box x={230} y={130} w={140} h={70} label="Slashed" sub="violation detected" stroke={danger} fill={bg} fg={danger} />
        <Box x={390} y={130} w={140} h={70} label="Cancelled" sub="voluntary exit" stroke={danger} fill={bg} fg={danger} />
        <Box x={570} y={130} w={140} h={70} label="(still Active)" sub="duration ongoing" stroke={muted} fill={bg} fg={muted} />

        {/* Row 2 → Row 3 arrows */}
        <ArrowLine x1={120} y1={200} x2={120} y2={260} />
        <ArrowLine x1={300} y1={200} x2={300} y2={260} />
        <ArrowLine x1={460} y1={200} x2={460} y2={260} />

        {/* Row 3: terminal states */}
        <Box x={50} y={260} w={140} h={70} label="Claimed" sub="principal + yield to you" stroke={win} fill={bg} fg={win} />
        <Box x={230} y={260} w={140} h={70} label="Forfeit" sub="principal → reward pool" stroke={muted} fill={bg} fg={muted} />
        <Box x={390} y={260} w={140} h={70} label="Forfeit" sub="principal → reward pool" stroke={muted} fill={bg} fg={muted} />
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
        <span><span style={{ color: gold }}>●</span> Active / Unlockable</span>
        <span><span style={{ color: danger }}>●</span> Slashed / Cancelled (you lose principal)</span>
        <span><span style={{ color: win }}>●</span> Claimed (you keep principal + yield)</span>
      </div>
    </div>
  );
}

function Box({
  x, y, w, h, label, sub, stroke, fill, fg,
}: {
  x: number; y: number; w: number; h: number;
  label: string; sub: string; stroke: string; fill: string; fg: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} ry={6} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + (sub ? 26 : h / 2 + 4)} textAnchor="middle" fontSize="14" fontWeight="700" fill={fg}>
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + 46} textAnchor="middle" fontSize="10" fill="var(--muted)">
          {sub}
        </text>
      )}
    </g>
  );
}

function ArrowLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="var(--gold)"
      strokeOpacity={0.5}
      strokeWidth={1.5}
      markerEnd="url(#arrowhead)"
    />
  );
}
