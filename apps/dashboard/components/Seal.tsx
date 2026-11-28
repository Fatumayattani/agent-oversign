"use client";

import { useMemo } from "react";
import { bandPaths, rosettePaths } from "@/lib/seal";

// A guilloche rosette, the engraved pattern used on cheques and banknotes to show a
// document is genuine. Here it stands for the signing key: turning while Oversign is
// signing, still and voided while the agent is frozen.
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
