"use client";

import { useMemo } from "react";

// A guilloche rosette, the engraved pattern used on cheques and banknotes to show a
// document is genuine. Here it stands for the signing key: turning while Oversign is
// signing, still and voided while the agent is frozen.
type Band = { base: number; amp: number; lobes: number; copies: number; shift: number };

function bandPaths({ base, amp, lobes, copies, shift }: Band): string[] {
  const steps = 720;
  const paths: string[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    const phase = (copy / copies) * shift;
    let d = "";
    for (let step = 0; step <= steps; step += 1) {
      const theta = (step / steps) * Math.PI * 2;
      const rho = base + amp * Math.sin(lobes * theta + phase);
      const x = rho * Math.cos(theta);
      const y = rho * Math.sin(theta);
      d += `${step === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    paths.push(`${d}Z`);
  }
  return paths;
}

function rosettePaths(copies: number): string[] {
  // Epitrochoid petals for the centre.
  const paths: string[] = [];
  const R = 30;
  const r = 6;
  const steps = 900;
  for (let copy = 0; copy < copies; copy += 1) {
    const d0 = 18 + copy * 2.2;
    let d = "";
    for (let step = 0; step <= steps; step += 1) {
      const t = (step / steps) * Math.PI * 2;
      const x = (R + r) * Math.cos(t) - d0 * Math.cos(((R + r) / r) * t);
      const y = (R + r) * Math.sin(t) - d0 * Math.sin(((R + r) / r) * t);
      d += `${step === 0 ? "M" : "L"}${(x * 0.95).toFixed(2)} ${(y * 0.95).toFixed(2)}`;
    }
    paths.push(`${d}Z`);
  }
  return paths;
}

export function Seal({ frozen, size = 260 }: { frozen: boolean; size?: number }) {
  const outer = useMemo(() => bandPaths({ base: 122, amp: 6, lobes: 40, copies: 9, shift: Math.PI }), []);
  const middle = useMemo(() => bandPaths({ base: 90, amp: 13, lobes: 20, copies: 12, shift: Math.PI * 2 }), []);
  const inner = useMemo(() => rosettePaths(5), []);

  return (
    <div className={`seal ${frozen ? "seal-frozen" : "seal-live"}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="-140 -140 280 280" width={size} height={size}>
        <circle r="136" className="seal-rim" />
        <circle r="131" className="seal-rim seal-rim-thin" />
        <g className="seal-band seal-band-outer">
          {outer.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </g>
        <g className="seal-band seal-band-middle">
          {middle.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </g>
        <g className="seal-band seal-band-inner">
          {inner.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </g>
        <circle r="9" className="seal-core" />
      </svg>
      {frozen && <span className="stamp stamp-blocked seal-void">Frozen</span>}
    </div>
  );
}
