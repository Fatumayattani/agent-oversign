// Geometry for the guilloche seal, shared by the dashboard and the app icon.
export type Band = { base: number; amp: number; lobes: number; copies: number; shift: number };

export function bandPaths({ base, amp, lobes, copies, shift }: Band): string[] {
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

export function rosettePaths(copies: number): string[] {
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
