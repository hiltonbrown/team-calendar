import { resolveCanonicalWebUrl } from "@repo/seo/canonical-url";
import type { MetadataRoute } from "next";
import { env } from "@/env";

const url = resolveCanonicalWebUrl({
  webUrl: env.NEXT_PUBLIC_WEB_URL,
  vercelProjectProductionUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
});

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: new URL("/sitemap.xml", url.href).href,
  };
}
