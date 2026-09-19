import { AuthProvider } from "@repo/auth/provider";
import {
  PublicDesignSystemProvider,
  type PublicDesignSystemProviderProperties,
} from "./providers/public";

type DesignSystemProviderProperties = PublicDesignSystemProviderProperties & {
  privacyUrl?: string;
  termsUrl?: string;
  helpUrl?: string;
  afterSignOutUrl?: string;
};

export const DesignSystemProvider = ({
  children,
  privacyUrl,
  termsUrl,
  helpUrl,
  afterSignOutUrl,
  ...properties
}: DesignSystemProviderProperties) => (
  <PublicDesignSystemProvider {...properties}>
    <AuthProvider
      afterSignOutUrl={afterSignOutUrl}
      helpUrl={helpUrl}
      privacyUrl={privacyUrl}
      termsUrl={termsUrl}
    >
      {children}
    </AuthProvider>
  </PublicDesignSystemProvider>
);
