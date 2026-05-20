import { AuthProvider } from "@repo/auth/provider";
import type { ThemeProviderProps } from "next-themes";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ThemeProvider } from "./providers/theme";

type DesignSystemProviderProperties = ThemeProviderProps & {
  auth?: boolean;
  privacyUrl?: string;
  termsUrl?: string;
  helpUrl?: string;
  afterSignOutUrl?: string;
};

export const DesignSystemProvider = ({
  auth = true,
  children,
  privacyUrl,
  termsUrl,
  helpUrl,
  afterSignOutUrl,
  ...properties
}: DesignSystemProviderProperties) => {
  const content = (
    <>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </>
  );

  return (
    <ThemeProvider {...properties}>
      {auth ? (
        <AuthProvider
          afterSignOutUrl={afterSignOutUrl}
          helpUrl={helpUrl}
          privacyUrl={privacyUrl}
          termsUrl={termsUrl}
        >
          {content}
        </AuthProvider>
      ) : (
        content
      )}
    </ThemeProvider>
  );
};
