"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import type { ComponentProps, ReactNode } from "react";

interface AuthProviderProperties {
  afterSignOutUrl?: string;
  children: ReactNode;
  helpUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

type AuthAppearance = NonNullable<
  ComponentProps<typeof ClerkProvider>["appearance"]
>;

export const chooseOrganizationTaskUrl = "/session-tasks/choose-organization";

export const AuthProvider = ({
  privacyUrl,
  termsUrl,
  helpUrl,
  ...properties
}: AuthProviderProperties) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const theme: AuthAppearance["theme"] = isDark ? dark : undefined;

  const variables: NonNullable<AuthAppearance["variables"]> = {
    borderRadius: "var(--radius)",
    colorBackground: "var(--background)",
    colorDanger: "var(--destructive)",
    colorForeground: "var(--foreground)",
    colorInput: "var(--input)",
    colorInputForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorPrimary: "var(--primary)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
    fontWeight: {
      bold: "var(--font-weight-bold)",
      medium: "var(--font-weight-medium)",
      normal: "var(--font-weight-normal)",
    },
  };

  const elements: NonNullable<AuthAppearance["elements"]> = {
    card: "shadow-none",
    dividerLine: "bg-border",
    footerActionLink: "text-primary hover:text-primary/80",
    formButtonPrimary: "rounded-2xl",
    formFieldInput: "rounded-xl",
    formFieldLabel: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    headerTitle: "text-foreground",
    navbarButton: "text-foreground",
    organizationPreview__organizationSwitcherTrigger: "gap-2",
    organizationPreviewAvatarContainer: "shrink-0",
    organizationPreviewMainIdentifier: "text-foreground",
    organizationSwitcherTrigger__open: "bg-background",
    organizationSwitcherTriggerIcon: "text-muted-foreground",
    socialButtonsIconButton: "bg-card",
  };

  const options: NonNullable<AuthAppearance["options"]> = {
    helpPageUrl: helpUrl,
    privacyPageUrl: privacyUrl,
    termsPageUrl: termsUrl,
  };
  const sessionTaskUrls = {
    "choose-organization": chooseOrganizationTaskUrl,
  };

  return (
    <ClerkProvider
      {...properties}
      appearance={{ elements, options, theme, variables }}
      taskUrls={sessionTaskUrls}
    />
  );
};
