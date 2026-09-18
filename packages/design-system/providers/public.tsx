import type { ThemeProviderProps } from "next-themes";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { ThemeProvider } from "./theme";

export type PublicDesignSystemProviderProperties = ThemeProviderProps;

export const PublicDesignSystemProvider = ({
  children,
  ...properties
}: PublicDesignSystemProviderProperties) => (
  <ThemeProvider {...properties}>
    <TooltipProvider>{children}</TooltipProvider>
    <Toaster />
  </ThemeProvider>
);
