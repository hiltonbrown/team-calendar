import { redirect } from "next/navigation";
import { buildLegacyAvailabilityRedirect } from "../../_legacy-redirect";

interface LegacyEditAvailabilityPageProps {
  params: Promise<{ recordId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LegacyEditAvailabilityPage = async ({
  params,
  searchParams,
}: LegacyEditAvailabilityPageProps) => {
  const { recordId } = await params;
  redirect(
    buildLegacyAvailabilityRedirect(
      `/plans/${recordId}/edit`,
      await searchParams
    )
  );
};

export default LegacyEditAvailabilityPage;
