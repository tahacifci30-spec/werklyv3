import type { NextConfig } from "next";

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Alleen voor een tweede, aparte testserver; standaard blijft het gewone .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      { source: "/:path*", headers: common },
      // Alles behalve de intake mag niet in een iframe: het klantformulier is bedoeld als insluitbare widget.
      {
        source: "/((?!intake).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
