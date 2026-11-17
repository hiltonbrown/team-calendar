import { requireAccount } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getSession } from "@repo/auth/server";
import type { AccountId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import { normaliseRole } from "@repo/feeds";
import { FeedCreateForm } from "@/components/feed/feed-create-form";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import { withOrg } from "@/lib/navigation/org-url";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";

interface NewFeedPageProps {
  searchParams: Promise<{ org?: string }>;
}

const NewFeedPage = async ({ searchParams }: NewFeedPageProps) => {
  const { org } = await searchParams;
  const { role: sessionRole } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  const role = normaliseRole(sessionRole);
  const accountId = (await requireAccount()) as AccountId;
  const canManage = can(role, { feeds: ["manageAll"] });
  const { organisationId, orgQueryValue, teams, people } = await withTenantDb(
    accountId,
    async (db) => {
      const context = await resolveActiveOrgPageContext(accountId, org, db);
      const scopedOrganisationId = context.organisationId;
      const [preparedTeams, preparedPeople] = canManage
        ? ([
            await db.team.findMany({
              orderBy: { name: "asc" },
              select: { id: true, name: true },
              where: {
                account_id: accountId,
                organisation_id: scopedOrganisationId,
              },
            }),
            await db.person.findMany({
              orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
              select: { first_name: true, id: true, last_name: true },
              where: {
                account_id: accountId,
                archived_at: null,
                is_active: true,
                organisation_id: scopedOrganisationId,
              },
            }),
          ] as const)
        : [[], []];
      return { ...context, people: preparedPeople, teams: preparedTeams };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
  if (!canManage) {
    return (
      <>
        <Header organisationId={organisationId} page="New feed" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <PermissionDeniedState
            ctaHref={withOrg("/feeds", orgQueryValue)}
            ctaLabel="Return to feeds"
            description="Only organisation admins and owners can create calendar feeds. You can still view and copy feeds shared with you."
            title="Feed creation is read-only"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Header organisationId={organisationId} page="New feed" />
      <div className="flex flex-1 flex-col p-6 pt-0">
        <div className="max-w-3xl rounded-2xl bg-background p-6">
          <FeedCreateForm
            canCreateOrgScope
            organisationId={organisationId}
            orgQueryValue={orgQueryValue}
            people={people.map((person) => ({
              id: person.id,
              name: `${person.first_name} ${person.last_name}`,
            }))}
            teams={teams}
          />
        </div>
      </div>
    </>
  );
};

export default NewFeedPage;
