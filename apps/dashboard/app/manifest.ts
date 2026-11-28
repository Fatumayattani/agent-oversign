import type { MetadataRoute } from "next";

// Lets the owner add the approvals page to their phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oversign",
    short_name: "Oversign",
    description: "Approve or stop what your AI agent pays for.",
    start_url: "/approve",
    display: "standalone",
    background_color: "#e9edf2",
    theme_color: "#18223a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
