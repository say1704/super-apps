"use client";

const NODES = [
  { cx: 720, cy: 450 },
  { cx: 270, cy: 300 },
  { cx: 1170, cy: 300 },
  { cx: 270, cy: 650 },
  { cx: 1170, cy: 650 },
  { cx: 400, cy: 150 },
  { cx: 1040, cy: 150 },
  { cx: 400, cy: 750 },
  { cx: 1040, cy: 750 },
];

const EDGES = [
  { x1: 720, y1: 450, x2: 270, y2: 300 },
  { x1: 720, y1: 450, x2: 1170, y2: 300 },
  { x1: 720, y1: 450, x2: 270, y2: 650 },
  { x1: 720, y1: 450, x2: 1170, y2: 650 },
  { x1: 720, y1: 450, x2: 400, y2: 150 },
  { x1: 720, y1: 450, x2: 1040, y2: 150 },
  { x1: 720, y1: 450, x2: 400, y2: 750 },
  { x1: 720, y1: 450, x2: 1040, y2: 750 },
  { x1: 270, y1: 300, x2: 1170, y2: 300 },
  { x1: 270, y1: 650, x2: 1170, y2: 650 },
  { x1: 400, y1: 150, x2: 1040, y2: 150 },
  { x1: 400, y1: 750, x2: 1040, y2: 750 },
  { x1: 270, y1: 300, x2: 400, y2: 750 },
  { x1: 1170, y1: 300, x2: 1040, y2: 750 },
  { x1: 400, y1: 150, x2: 1170, y2: 650 },
  { x1: 1040, y1: 150, x2: 270, y2: 650 },
];

export default function NetworkBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </radialGradient>
          {EDGES.map((e, i) => (
            <path key={i} id={`edge-${i}`} d={`M${e.x1},${e.y1} L${e.x2},${e.y2}`} />
          ))}
        </defs>

        {/* Hub glow */}
        <circle cx={720} cy={450} r="140" fill="url(#hubGlow)" />

        {/* Node glows */}
        {NODES.slice(1).map((n, i) => (
          <circle key={i} cx={n.cx} cy={n.cy} r="70" fill="url(#glow)" />
        ))}

        {/* Edges */}
        <g fill="none" stroke="#60A5FA" strokeWidth="1" opacity="0.4" strokeDasharray="4 3">
          {EDGES.map((_, i) => (
            <use key={i} href={`#edge-${i}`} />
          ))}
        </g>

        {/* Nodes */}
        {NODES.map((n, i) => (
          <g key={i}>
            <circle
              cx={n.cx}
              cy={n.cy}
              r={i === 0 ? 6 : 4}
              fill="none"
              stroke={i === 0 ? "#22D3EE" : "#60A5FA"}
              strokeWidth="1.5"
            >
              <animate attributeName="r" values={i === 0 ? "6;12;6" : "4;8;4"} dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle
              cx={n.cx}
              cy={n.cy}
              r={i === 0 ? 3 : 2}
              fill={i === 0 ? "#22D3EE" : "#60A5FA"}
            >
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        ))}

        {/* Data flow packets moving along edges */}
        {EDGES.map((_, i) => (
          <g key={i}>
            <circle r="2.5" fill="#22D3EE">
              <animateMotion dur="3s" repeatCount="indefinite" begin={`${i * 0.2}s`}>
                <mpath href={`#edge-${i}`} />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" dur="3s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
            </circle>
            <circle r="2" fill="#60A5FA">
              <animateMotion dur="4s" repeatCount="indefinite" begin={`${i * 0.3 + 1.5}s`}>
                <mpath href={`#edge-${i}`} />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" dur="4s" repeatCount="indefinite" begin={`${i * 0.3 + 1.5}s`} />
            </circle>
            <circle r="1.5" fill="#93C5FD">
              <animateMotion dur="5s" repeatCount="indefinite" begin={`${i * 0.4 + 3}s`}>
                <mpath href={`#edge-${i}`} />
              </animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" begin={`${i * 0.4 + 3}s`} />
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}
