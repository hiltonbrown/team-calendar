"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { Theme } from "@clerk/nextjs/types";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";

type AuthProviderProperties = ComponentProps<typeof ClerkProvider> & {
  privacyUrl?: string;
  termsUrl?: string;
  helpUrl?: string;
};

export const chooseOrganizationTaskUrl = "/session-tasks/choose-organization";

export const AuthProvider = ({
  privacyUrl,
  termsUrl,
  helpUrl,
  ...properties
}: AuthProviderProperties) => {
  const { taskUrls, ...clerkProperties } = properties;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const baseTheme = isDark ? dark : undefined;

  const variables: Theme["variables"] = {
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
    fontWeight: {
      bold: "var(--font-weight-bold)",
      normal: "var(--font-weight-normal)",
      medium: "var(--font-weight-medium)",
    },
    colorPrimary: "var(--primary)",
    colorDanger: "var(--destructive)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorBackground: "var(--background)",
    colorInputBackground: "var(--input)",
    colorInputText: "var(--foreground)",
    borderRadius: "var(--radius)",
  };

  const elements: Theme["elements"] = {
    dividerLine: "bg-border",
    socialButtonsIconButton: "bg-card",
    navbarButton: "text-foreground",
    organizationSwitcherTrigger__open: "bg-background",
    organizationPreviewMainIdentifier: "text-foreground",
    organizationSwitcherTriggerIcon: "text-muted-foreground",
    organizationPreview__organizationSwitcherTrigger: "gap-2",
    organizationPreviewAvatarContainer: "shrink-0",
    card: "shadow-none",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    formFieldLabel: "text-foreground",
    formFieldInput: "rounded-xl",
    footerActionLink: "text-primary hover:text-primary/80",
    formButtonPrimary: "rounded-2xl",
  };

  const layout: Theme["layout"] = {
    privacyPageUrl: privacyUrl,
    termsPageUrl: termsUrl,
    helpPageUrl: helpUrl,
  };
  const sessionTaskUrls: NonNullable<AuthProviderProperties["taskUrls"]> = {
    "choose-organization": chooseOrganizationTaskUrl,
    ...taskUrls,
  };

  return (
    <ClerkProvider
      {...clerkProperties}
      appearance={{ layout, baseTheme, elements, variables }}
      taskUrls={sessionTaskUrls}
    />
  );
};
