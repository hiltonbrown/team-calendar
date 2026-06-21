import { TaskChooseOrganization as ClerkTaskChooseOrganization } from "@clerk/nextjs";

export const chooseOrganizationTaskRedirectUrl = "/";

export const ChooseOrganizationTask = () => (
  <ClerkTaskChooseOrganization
    redirectUrlComplete={chooseOrganizationTaskRedirectUrl}
  />
);
