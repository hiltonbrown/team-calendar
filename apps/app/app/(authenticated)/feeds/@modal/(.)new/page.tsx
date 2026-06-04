import { auth } from "@repo/auth/server";
import { database } from "@repo/database";
import { normaliseRole } from "@repo/feeds";
import { FeedCreateForm } from "@/components/feed/feed-create-form";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

interface NewFeedModalPageProps {
  searchParams: Promise<{ org?: string }>;
}

const NewFeedModalPage = async ({ searchParams }: NewFeedModalPageProps) => {
  const { org } = await searchParams;
  const { orgRole } = await auth();
  const role = normaliseRole(orgRole);
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);
  const [teams, people] = await Promise.all([
    database.team.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { clerk_org_id: clerkOrgId, organisation_id: organisationId },
    }),
    database.person.findMany({
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      select: { first_name: true, id: true, last_name: true },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        is_active: true,
        organisation_id: organisationId,
      },
    }),
  ]);

  return (
    <InterceptingModalShell size="wide" title="New feed">
      <FeedCreateForm
        canCreateOrgScope={role === "org:admin" || role === "org:owner"}
        organisationId={organisationId}
        people={people.map((person) => ({
          id: person.id,
          name: `${person.first_name} ${person.last_name}`,
        }))}
        teams={teams}
      />
    </InterceptingModalShell>
  );
};

export default NewFeedModalPage;
