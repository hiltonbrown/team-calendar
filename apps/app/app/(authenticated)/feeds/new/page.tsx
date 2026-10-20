import { requireOrg } from "@repo/auth/helpers";
import { auth } from "@repo/auth/server";
import type { ClerkOrgId } from "@repo/core";
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
  const { orgRole } = await auth();
  const role = normaliseRole(orgRole);
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const canManage =
    role === "admin" ||
    role === "owner" ||
    role === "org:admin" ||
    role === "org:owner";
  const { organisationId, orgQueryValue, teams, people } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const context = await resolveActiveOrgPageContext(clerkOrgId, org, db);
      const scopedOrganisationId = context.organisationId;
      const [preparedTeams, preparedPeople] = canManage
        ? ([
            await db.team.findMany({
              orderBy: { name: "asc" },
              select: { id: true, name: true },
              where: {
                clerk_org_id: clerkOrgId,
                organisation_id: scopedOrganisationId,
              },
            }),
            await db.person.findMany({
              orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
              select: { first_name: true, id: true, last_name: true },
              where: {
                archived_at: null,
                clerk_org_id: clerkOrgId,
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
