import { redirect } from "next/navigation";
import { buildLegacyLeaveBalancesRedirect } from "./_legacy-redirect";

interface LegacyLeaveBalancesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LegacyLeaveBalancesPage = async ({
  searchParams,
}: LegacyLeaveBalancesPageProps) => {
  redirect(buildLegacyLeaveBalancesRedirect(await searchParams));
};

export default LegacyLeaveBalancesPage;
