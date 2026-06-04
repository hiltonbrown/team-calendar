import { redirect } from "next/navigation";
import { withOrg } from "@/lib/navigation/org-url";

interface LegacyLeaveBalancesPageProps {
  searchParams: Promise<{ org?: string; personId?: string }>;
}

const LegacyLeaveBalancesPage = async ({
  searchParams,
}: LegacyLeaveBalancesPageProps) => {
  const { org, personId } = await searchParams;
  if (personId) {
    redirect(withOrg(`/people/${personId}`, org));
  }
  redirect(withOrg("/people", org));
};

export default LegacyLeaveBalancesPage;
