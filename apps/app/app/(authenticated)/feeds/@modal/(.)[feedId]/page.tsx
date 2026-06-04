import { auth, currentUser } from "@repo/auth/server";
import { getFeedDetail, normaliseRole, previewFeed } from "@repo/feeds";
import { notFound } from "next/navigation";
import { FeedDetail } from "@/components/feed/feed-detail";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

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
  const canManage =
    role === "org:admin" ||
    role === "org:owner" ||
    role === "admin" ||
    role === "owner";
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);
  const detail = await getFeedDetail({
    actingRole: role,
    actingUserId: user.id,
    clerkOrgId,
    feedId,
    organisationId,
  });
  if (!detail.ok) {
    notFound();
  }

  const modes = canManage
    ? (["named", "masked", "private"] as const)
    : ([detail.value.privacyMode] as const);
  const previews = Object.fromEntries(
    await Promise.all(
      modes.map(async (mode) => {
        const result = await previewFeed({
          actingRole: role,
          actingUserId: user.id,
          clerkOrgId,
          feedId,
          horizonDays: 30,
          organisationId,
          privacyMode: mode,
        });
        return [
          mode,
          result.ok
            ? result.value.map((event) => ({
                ...event,
                endsAt: event.endsAt.toISOString(),
                startsAt: event.startsAt.toISOString(),
              }))
            : [],
        ];
      })
    )
  );

  return (
    <InterceptingModalShell size="wide" title="Feed details">
      <FeedDetail
        canManage={canManage}
        detail={detail.value}
        organisationId={organisationId}
        previews={previews}
      />
    </InterceptingModalShell>
  );
};

export default FeedDetailModalPage;
