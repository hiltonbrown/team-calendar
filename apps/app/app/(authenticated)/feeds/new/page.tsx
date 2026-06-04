import { auth } from "@repo/auth/server";
import { database } from "@repo/database";
import { normaliseRole } from "@repo/feeds";
import { FeedCreateForm } from "@/components/feed/feed-create-form";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";

interface NewFeedPageProps {
  searchParams: Promise<{ org?: string }>;
}

const NewFeedPage = async ({ searchParams }: NewFeedPageProps) => {
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
    <>
      <Header page="New feed" />
      <main className="flex flex-1 flex-col p-6 pt-0">
        <div className="max-w-3xl rounded-2xl bg-background p-6">
          <FeedCreateForm
            canCreateOrgScope={role === "org:admin" || role === "org:owner"}
            organisationId={organisationId}
            people={people.map((person) => ({
              id: person.id,
              name: `${person.first_name} ${person.last_name}`,
            }))}
            teams={teams}
          />
        </div>
      </main>
    </>
  );
};

export default NewFeedPage;
