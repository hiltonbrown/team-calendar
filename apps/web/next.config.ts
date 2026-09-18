import createMDX from "@next/mdx";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { resolveAuthLinks } from "./src/lib/auth-link-values";

const { signInHref, signUpHref } = resolveAuthLinks({
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV,
});

const webConfig: NextConfig = {
  ...config,
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  async redirects() {
    return [
      {
        destination: signInHref,
        permanent: false,
        source: "/sign-in",
      },
      {
        destination: signInHref,
        permanent: false,
        source: "/login",
      },
      {
        destination: signUpHref,
        permanent: false,
        source: "/sign-up",
      },
      {
        destination: signUpHref,
        permanent: false,
        source: "/register",
      },
    ];
  },
};

let nextConfig: NextConfig = withLogging(webConfig);

if (process.env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (process.env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

const withMDX = createMDX();

export default withMDX(nextConfig);
