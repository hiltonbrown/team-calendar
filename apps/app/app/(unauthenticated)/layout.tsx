import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import type { ReactNode } from "react";
import { BrandPanel, MobileBrand } from "./components/brand-panel";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="relative grid h-dvh w-full grid-cols-1 lg:grid-cols-2">
    <BrandPanel />
    <div className="auth-form-pane relative flex items-center justify-center px-4 py-12 sm:px-8 lg:p-8">
      <div className="absolute top-4 right-4 lg:hidden">
        <ModeToggle />
      </div>
      <div className="auth-rise mx-auto flex w-full max-w-[400px] flex-col justify-center gap-8">
        <MobileBrand />
        {children}
      </div>
    </div>
  </div>
);

export default AuthLayout;
