import type { NextConfig } from "next";

// FastAPI origin. Browser code always calls same-origin /api/v1 (plan §6 "Prefer same-origin API proxy").
const API_ORIGIN = process.env.HEALTHACCESS_API_ORIGIN ?? "http://localhost:8000";

const securityHeaders = [
  // /practitioner/records/:readSessionId carries a session id in the path; never leak it via Referer.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

// Pages that render patient data or codes must not be cached by the browser or any proxy (plan §4).
const noStore = [{ key: "Cache-Control", value: "no-store" }];
const sensitivePaths = ["/app/:path*", "/app", "/practitioner/:path*", "/lookup", "/admin/:path*", "/assistant"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    // A stray lockfile in a parent folder confuses root detection; pin it to this app.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...sensitivePaths.map((source) => ({ source, headers: noStore })),
    ];
  },
};

export default nextConfig;
