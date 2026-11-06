import { requireAccount } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
import type { AccountId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import { getOwnFeedEligibility, listFeeds, normaliseRole } from "@repo/feeds";
import { PauseIcon, UserRoundXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { OtherFeedsList } from "@/components/feed/other-feeds-list";
import { YourCalendar } from "@/components/feed/your-calendar";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { recommendFeed } from "@/lib/feeds/recommend-feed";
import { withOrg } from "@/lib/navigation/org-url";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../components/header";
import { OwnFeedActions } from "./own-feed-actions";

export const metadata: Metadata = {
  description:
    "Add Team Calendar leave and availability to the calendar app you already use.",
  title: "Calendar feeds | Team Calendar",
};

interface FeedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// S-13 Feeds is the subscribe page for every role: one recommended feed with
// provider actions, then other feeds the person can use. Feed administration
// lives on the feed detail page and S-21 `/settings/feeds`.
const FeedPage = async ({ searchParams }: FeedPageProps) => {
  await requirePagePermission({ feeds: ["read"] });
  const { org } = await searchParams;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const [{ role: sessionRole }, user, account] = await Promise.all([
    getSession().then(
      (currentSession) =>
        currentSession ?? {
          accountId: null,
          role: null,
          sessionId: null,
          userId: null,
        }
    ),
    getCurrentUser(),
    requireAccount(),
  ]);
  const accountId = account as AccountId;
  const role = normaliseRole(sessionRole);
  const isAdmin = can(role, { feeds: ["manageAll"] });

  const { organisationId, orgQueryValue, feedsResult, eligibilityResult } =
    await withTenantDb(
      accountId,
      async (db) => {
        const context = await resolveActiveOrgPageContext(
          accountId,
          orgParam,
          db
        );
        const scopedOrganisationId = context.organisationId;
        const [preparedFeedsResult, preparedEligibilityResult] = user
          ? ([
              await listFeeds(
                {
                  accountId,
                  actingRole: role,
                  actingUserId: user.id,
                  filters: { status: ["active", "paused"] },
                  organisationId: scopedOrganisationId,
                  pagination: { pageSize: 100 },
                },
                db
              ),
              await getOwnFeedEligibility(
                {
                  accountId,
                  actingUserId: user.id,
                  organisationId: scopedOrganisationId,
                },
                db
              ),
            ] as const)
          : ([null, null] as const);
        return {
          ...context,
          eligibilityResult: preparedEligibilityResult,
          feedsResult: preparedFeedsResult,
        };
      },
      TENANT_READ_TRANSACTION_OPTIONS
    );

  const hasLoadError = !feedsResult?.ok;
  const { others, ownPausedFeed, recommended } = recommendFeed(
    feedsResult?.ok ? feedsResult.value : []
  );
  const eligibility = eligibilityResult?.ok ? eligibilityResult.value : null;
  const canCreatePersonal = Boolean(
    eligibility?.personId && !eligibility.personalFeedId
  );
  const canCreateTeam = Boolean(
    eligibility?.personId &&
      eligibility.hasDirectReports &&
      !eligibility.teamFeedId
  );

  const notices: ReactNode[] = [];
  if (eligibility && !eligibility.personId) {
    notices.push(
      <Notice icon={<UserRoundXIcon />} key="unlinked">
        Your account is not linked to a person yet, so you cannot create your
        own calendar feed. Ask an administrator to link it.
      </Notice>
    );
  }
  if (ownPausedFeed) {
    notices.push(
      <Notice icon={<PauseIcon />} key="paused">
        {ownPausedFeed.name} is paused and not updating.{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4 hover:decoration-2"
          href={withOrg(`/feeds/${ownPausedFeed.id}`, orgQueryValue)}
        >
          Open feed
        </Link>
      </Notice>
    );
  }
  if (!(hasLoadError || recommended || canCreatePersonal || canCreateTeam)) {
    notices.push(
      <Notice key="ask-admin">Ask an administrator to set one up.</Notice>
    );
  }

  return (
    <>
      <Header organisationId={organisationId} page="Feeds" />
      <div className="flex flex-1 flex-col gap-8 p-6 pt-0">
        <section className="flex flex-col justify-between gap-3 rounded-xl bg-surface-container-low p-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-semibold text-foreground text-headline-md">
              Calendar feeds
            </h1>
            <p className="mt-2 max-w-2xl text-body-sm text-muted-foreground">
              Add Team Calendar to the calendar app you already use. Feeds
              update automatically.
            </p>
          </div>
          {isAdmin ? (
            <Link
              className="font-medium text-foreground text-label-lg underline underline-offset-4 hover:decoration-2"
              href={withOrg("/settings/feeds", orgQueryValue)}
            >
              Manage all feeds
            </Link>
          ) : null}
        </section>

        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <YourCalendar
            actions={
              hasLoadError || !(canCreatePersonal || canCreateTeam) ? null : (
                <OwnFeedActions
                  canCreatePersonal={canCreatePersonal}
                  canCreateTeam={canCreateTeam}
                  organisationId={organisationId}
                />
              )
            }
            feed={recommended}
            hasLoadError={hasLoadError}
            notice={notices.length > 0 ? notices : null}
          />
          <OtherFeedsList feeds={others} orgQueryValue={orgQueryValue} />
        </div>
      </div>
    </>
  );
};

function Notice({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-body-sm text-muted-foreground [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <span>{children}</span>
    </p>
  );
}

export default FeedPage;
