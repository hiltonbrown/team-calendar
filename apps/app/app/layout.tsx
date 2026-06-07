import { env } from "@/env";
import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import type { ReactNode } from "react";

interface RootLayoutProperties {
  readonly children: ReactNode;
}

const webUrl = (path: string): string =>
  env.NEXT_PUBLIC_WEB_URL
    ? new URL(path, env.NEXT_PUBLIC_WEB_URL).toString()
    : path;

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html className={fonts} lang="en" suppressHydrationWarning>
    <body suppressHydrationWarning>
      <AnalyticsProvider>
        <DesignSystemProvider
          afterSignOutUrl={env.NEXT_PUBLIC_WEB_URL}
          helpUrl={env.NEXT_PUBLIC_DOCS_URL}
          privacyUrl={webUrl("/legal/privacy")}
          termsUrl={webUrl("/legal/terms")}
        >
          {children}
        </DesignSystemProvider>
      </AnalyticsProvider>
    </body>
  </html>
);

export default RootLayout;
