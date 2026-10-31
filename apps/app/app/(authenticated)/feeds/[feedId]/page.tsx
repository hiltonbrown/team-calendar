import { requireAccount } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
import type { AccountId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import { getFeedDetail, normaliseRole, previewFeed } from "@repo/feeds";
import { notFound } from "next/navigation";
import { FeedDetail } from "@/components/feed/feed-detail";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";

interface FeedDetailPageProps {
  params: Promise<{ feedId: string }>;
  searchParams: Promise<{ org?: string }>;
}

const FeedDetailPage = async ({
  params,
  searchParams,
}: FeedDetailPageProps) => {
  const { feedId } = await params;
  const { org } = await searchParams;
  const { role: sessionRole } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  const user = await getCurrentUser();
  if (!user) {
    notFound();
  }
  const role = normaliseRole(sessionRole);
  const isAdmin = can(role, { feeds: ["manageAll"] });
  const accountId = (await requireAccount()) as AccountId;
  const { organisationId, detail, canManage, previews, previewErrors } =
    await withTenantDb(
      accountId,
      async (db) => {
        const { organisationId: scopedOrganisationId } =
          await resolveActiveOrgPageContext(accountId, org, db);
        const preparedDetail = await getFeedDetail(
          {
            accountId,
            actingRole: role,
            actingUserId: user.id,
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
              accountId,
              actingRole: role,
              actingUserId: user.id,
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
    <>
      <Header organisationId={organisationId} page="Feed details" />
      <div className="flex flex-1 flex-col p-6 pt-0">
        <FeedDetail
          canManage={canManage}
          detail={detail.value}
          isAdmin={isAdmin}
          organisationId={organisationId}
          previewErrors={previewErrors}
          previews={previews}
        />
      </div>
    </>
  );
};

export default FeedDetailPage;
