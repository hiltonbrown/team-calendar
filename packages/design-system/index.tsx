import {
  PublicDesignSystemProvider,
  type PublicDesignSystemProviderProperties,
} from "./providers/public";

export const DesignSystemProvider = ({
  children,
  ...properties
}: PublicDesignSystemProviderProperties) => (
  <PublicDesignSystemProvider {...properties}>
    {children}
  </PublicDesignSystemProvider>
);
