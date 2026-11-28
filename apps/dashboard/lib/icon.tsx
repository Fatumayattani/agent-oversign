import { ImageResponse } from "next/og";
import { bandPaths, rosettePaths } from "./seal";

// The seal on ink, as a PNG for the phone's home screen.
export function sealIcon(size: number): ImageResponse {
  const path = (d: string, stroke: string, width: number, opacity = 1) =>
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-160 -160 320 320" width="${size}" height="${size}">`,
    `<rect x="-160" y="-160" width="320" height="320" fill="#18223a"/>`,
    `<circle r="136" fill="#f7f9fb"/>`,
    ...bandPaths({ base: 122, amp: 6, lobes: 40, copies: 9, shift: Math.PI }).map((d) => path(d, "#8ea3c0", 0.9)),
    ...bandPaths({ base: 90, amp: 13, lobes: 20, copies: 12, shift: Math.PI * 2 }).map((d) => path(d, "#8ea3c0", 0.9)),
    ...rosettePaths(5).map((d) => path(d, "#18223a", 1.1, 0.7)),
    `<circle r="10" fill="#18223a"/>`,
    `</svg>`,
  ].join("");
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={src} width={size} height={size} alt="" />, { width: size, height: size });
}
