import { redirect } from "next/navigation";
import { buildLegacyAvailabilityRedirect } from "../_legacy-redirect";

interface LegacyNewAvailabilityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LegacyNewAvailabilityPage = async ({
  searchParams,
}: LegacyNewAvailabilityPageProps) => {
  redirect(buildLegacyAvailabilityRedirect("/plans/new", await searchParams));
};

export default LegacyNewAvailabilityPage;
