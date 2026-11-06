import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import { headers } from "next/headers";
import type { ReactNode } from "react";

interface RootLayoutProperties {
  readonly children: ReactNode;
}

const RootLayout = async ({ children }: RootLayoutProperties) => {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  return (
    <html className={fonts} lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AnalyticsProvider nonce={nonce}>
          <DesignSystemProvider nonce={nonce}>{children}</DesignSystemProvider>
        </AnalyticsProvider>
      </body>
    </html>
  );
};

export default RootLayout;
