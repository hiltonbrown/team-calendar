import { redirect } from "next/navigation";
import { withOrg } from "@/lib/navigation/org-url";

interface LegacyNewAvailabilityPageProps {
  searchParams: Promise<{ org?: string }>;
}

const LegacyNewAvailabilityPage = async ({
  searchParams,
}: LegacyNewAvailabilityPageProps) => {
  const { org } = await searchParams;
  redirect(withOrg("/plans/new", org));
};

export default LegacyNewAvailabilityPage;
