import path from "node:path";
import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

export const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

export const config: NextConfig = {
  experimental: {
    turbopackPluginRuntimeStrategy: "workerThreads",
  },
  // biome-ignore lint/suspicious/useAwait: headers is async
  async headers() {
    return [{ headers: securityHeaders, source: "/(.*)" }];
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        hostname: "img.clerk.com",
        protocol: "https",
      },
    ],
  },

  // biome-ignore lint/suspicious/useAwait: rewrites is async
  async rewrites() {
    return [
      {
        destination: "https://us-assets.i.posthog.com/static/:path*",
        source: "/ingest/static/:path*",
      },
      {
        destination: "https://us.i.posthog.com/:path*",
        source: "/ingest/:path*",
      },
      {
        destination: "https://us.i.posthog.com/decide",
        source: "/ingest/decide",
      },
    ];
  },
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-neon",
    "@prisma/adapter-pg",
    "require-in-the-middle",
    "import-in-the-middle",
  ],

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: path.resolve(import.meta.dirname, "../../"),
  },
};

export const withAnalyzer = (sourceConfig: NextConfig): NextConfig =>
  withBundleAnalyzer()(sourceConfig);
