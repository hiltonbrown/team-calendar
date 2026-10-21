import { requireOrg } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import type { ClerkOrgId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import { getFeedDetail, normaliseRole, previewFeed } from "@repo/feeds";
import { notFound } from "next/navigation";
import { FeedDetail } from "@/components/feed/feed-detail";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

interface FeedDetailModalPageProps {
  params: Promise<{ feedId: string }>;
  searchParams: Promise<{ org?: string }>;
}

const FeedDetailModalPage = async ({
  params,
  searchParams,
}: FeedDetailModalPageProps) => {
  const { feedId } = await params;
  const { org } = await searchParams;
  const { orgRole } = await auth();
  const user = await currentUser();
  if (!user) {
    notFound();
  }
  const role = normaliseRole(orgRole);
  const isAdmin =
    role === "org:admin" ||
    role === "org:owner" ||
    role === "admin" ||
    role === "owner";
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const { organisationId, detail, canManage, previews, previewErrors } =
    await withTenantDb(
      clerkOrgId,
      async (db) => {
        const { organisationId: scopedOrganisationId } =
          await resolveActiveOrgPageContext(clerkOrgId, org, db);
        const preparedDetail = await getFeedDetail(
          {
            actingRole: role,
            actingUserId: user.id,
            clerkOrgId,
            feedId,
            organisationId: scopedOrganisationId,
          },
          db
        );
        if (!preparedDetail.ok) {
          notFound();
        }
        // Owners of a personal or team feed manage it like an administrator.
        const preparedCanManage =
          isAdmin || preparedDetail.value.isOwnedByActor;

        const modes = preparedCanManage
          ? (["named", "masked", "private"] as const)
          : ([preparedDetail.value.privacyMode] as const);
        const preparedPreviewErrors: Partial<
          Record<"named" | "masked" | "private", string>
        > = {};
        const preparedPreviews: Parameters<typeof FeedDetail>[0]["previews"] =
          {};
        for (const mode of modes) {
          const result = await previewFeed(
            {
              actingRole: role,
              actingUserId: user.id,
              clerkOrgId,
              feedId,
              horizonDays: 30,
              organisationId: scopedOrganisationId,
              privacyMode: mode,
            },
            db
          );
          if (!result.ok) {
            preparedPreviewErrors[mode] = result.error.message;
          }

          preparedPreviews[mode] = result.ok
            ? result.value.map((event) => ({
                ...event,
                endsAt: event.endsAt.toISOString(),
                startsAt: event.startsAt.toISOString(),
              }))
            : [];
        }

        return {
          canManage: preparedCanManage,
          detail: preparedDetail,
          organisationId: scopedOrganisationId,
          previewErrors: preparedPreviewErrors,
          previews: preparedPreviews,
        };
      },
      TENANT_READ_TRANSACTION_OPTIONS
    );

  return (
    <InterceptingModalShell size="wide" title="Feed details">
      <FeedDetail
        canManage={canManage}
        detail={detail.value}
        isAdmin={isAdmin}
        organisationId={organisationId}
        previewErrors={previewErrors}
        previews={previews}
      />
    </InterceptingModalShell>
  );
};

export default FeedDetailModalPage;
