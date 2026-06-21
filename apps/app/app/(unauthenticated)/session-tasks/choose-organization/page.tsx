import { ChooseOrganizationTask } from "@repo/auth/components/choose-organization-task";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";

const title = "Choose an organisation";
const description =
  "Create a new LeaveSync organisation or continue with an existing invitation.";

export const metadata: Metadata = createMetadata({ title, description });

const ChooseOrganizationTaskPage = () => <ChooseOrganizationTask />;

export default ChooseOrganizationTaskPage;
