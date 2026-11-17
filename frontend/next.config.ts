import type { NextConfig } from "next";

const securityHeaders = [
  // /practitioner/records/:readSessionId carries a session id in the path; never leak it via Referer.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // The product offers no geolocation path: the directory takes an area id only.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Pages that render patient data or codes must not be cached by the browser or any proxy.
const noStore = [{ key: "Cache-Control", value: "no-store" }];
const sensitivePaths = [
  "/app/:path*",
  "/app",
  "/practitioner/:path*",
  "/lookup",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    // A stray lockfile in a parent folder confuses root detection; pin it to this app.
    root: __dirname,
    rules: {
      // Tailwind owns the landing globals. CSS modules (ours and Arc's) must keep their class exports.
      "*.css": {
        condition: {
          all: [{ not: { path: "**/*.module.css" } }, { not: { path: /^src\/components\/arc\// } }],
        },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      ...sensitivePaths.map((source) => ({ source, headers: noStore })),
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
