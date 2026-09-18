import { redirect } from "next/navigation";
import { buildLegacyAvailabilityRedirect } from "./_legacy-redirect";

interface LegacyAvailabilityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LegacyAvailabilityPage = async ({
  searchParams,
}: LegacyAvailabilityPageProps) => {
  redirect(buildLegacyAvailabilityRedirect("/plans", await searchParams));
};

export default LegacyAvailabilityPage;
