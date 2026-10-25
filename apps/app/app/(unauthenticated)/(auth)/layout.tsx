import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import { resolveCanonicalWebUrl } from "@repo/seo/canonical-url";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandPanel, MobileBrand } from "@/components/brand/brand-panel";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { follow: false, index: false },
};

interface AuthLayoutProps {
  readonly children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="relative grid min-h-dvh w-full grid-cols-1 lg:grid-cols-2">
    <BrandPanel />
    <div className="auth-form-pane relative flex items-center justify-center px-4 py-12 sm:px-8 lg:p-8">
      <div className="absolute top-4 right-4 lg:hidden">
        <ModeToggle />
      </div>
      <div className="auth-rise mx-auto flex w-full max-w-[400px] flex-col justify-center gap-8">
        <MobileBrand />
        {children}
        <nav
          aria-label="Legal"
          className="flex flex-wrap justify-center gap-x-6 text-body-sm text-muted-foreground"
        >
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground focus-visible:outline-3 focus-visible:outline-primary focus-visible:outline-offset-2"
            href={new URL("/privacy-policy", resolveCanonicalWebUrl()).href}
          >
            Privacy policy
          </a>
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground focus-visible:outline-3 focus-visible:outline-primary focus-visible:outline-offset-2"
            href={new URL("/terms-of-service", resolveCanonicalWebUrl()).href}
          >
            Terms of service
          </a>
        </nav>
      </div>
    </div>
  </div>
);

export default AuthLayout;
