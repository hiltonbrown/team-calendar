import { SignOutButton } from "@repo/auth/client";
import { auth, currentUser } from "@repo/auth/server";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import type { ReactNode } from "react";
import { BrandPanel, MobileBrand } from "@/components/brand/brand-panel";

interface SetupLayoutProps {
  readonly children: ReactNode;
}

// First-run frame for the setup wizard and member welcome: the sign-in split
// layout without the app sidebar, so sign-up flows straight into setup.
const SetupLayout = async ({ children }: SetupLayoutProps) => {
  const [user, { redirectToSignIn }] = await Promise.all([
    currentUser(),
    auth(),
  ]);
  if (!user) {
    return redirectToSignIn();
  }

  return (
    <div className="relative grid min-h-dvh w-full grid-cols-1 lg:grid-cols-2">
      <BrandPanel tagline="A few quick steps and your team calendar is ready." />
      <div className="auth-form-pane relative flex flex-col px-4 py-6 sm:px-8 lg:p-8">
        <header className="flex items-center justify-between gap-4">
          <div className="lg:hidden">
            <MobileBrand />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SignOutButton>
              <button
                className="min-h-11 rounded-md px-3 font-medium text-label-lg text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                type="button"
              >
                Sign out
              </button>
            </SignOutButton>
            <div className="lg:hidden">
              <ModeToggle />
            </div>
          </div>
        </header>
        <main className="flex flex-1 items-start justify-center py-8 lg:items-center">
          {children}
        </main>
      </div>
    </div>
  );
};

export default SetupLayout;
