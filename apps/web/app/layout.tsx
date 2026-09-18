import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { marketingFonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import { PublicDesignSystemProvider } from "@repo/design-system/providers/public";
import type { ReactNode } from "react";
import { Footer } from "./components/footer";
import { Header } from "./components/header";

interface RootLayoutProperties {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html
    className={cn(marketingFonts, "scroll-smooth")}
    lang="en-AU"
    suppressHydrationWarning
  >
    <body>
      <AnalyticsProvider>
        <PublicDesignSystemProvider>
          <Header />
          {children}
          <Footer />
        </PublicDesignSystemProvider>
      </AnalyticsProvider>
    </body>
  </html>
);

export default RootLayout;
