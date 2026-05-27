import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import { getDictionary } from "@repo/internationalization";
import type { ReactNode } from "react";
import { Footer } from "./components/footer";
import { Header } from "./components/header";

interface RootLayoutProperties {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
}

const RootLayout = async ({ children, params }: RootLayoutProperties) => {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const shouldRenderCMSToolbar = process.env.NODE_ENV === "production";
  const CMSToolbar = shouldRenderCMSToolbar
    ? (await import("@repo/cms/components/toolbar")).Toolbar
    : null;

  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <AnalyticsProvider>
          <DesignSystemProvider auth={false}>
            <Header dictionary={dictionary} />
            {children}
            <Footer />
          </DesignSystemProvider>
          {CMSToolbar ? <CMSToolbar /> : null}
        </AnalyticsProvider>
      </body>
    </html>
  );
};

export default RootLayout;
