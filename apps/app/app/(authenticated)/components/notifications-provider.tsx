"use client";

import { NotificationsProvider as RawNotificationsProvider } from "@repo/notifications/components/provider";
import type { ReactNode } from "react";
import { getPublicApiUrl } from "@/lib/public-api-url";

interface NotificationsProviderProperties {
  children: ReactNode;
  enabled: boolean;
}

export const NotificationsProvider = ({
  children,
  enabled,
}: NotificationsProviderProperties) => {
  const streamUrl = enabled
    ? getPublicApiUrl("/api/notifications/stream")
    : null;

  return (
    <RawNotificationsProvider streamUrl={streamUrl}>
      {children}
    </RawNotificationsProvider>
  );
};
