import { auth, currentUser } from "@repo/auth/server";
import {
  getPersonProfile,
  listHistoryPage,
  type PeopleRole,
  type PersonProfile,
} from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PersonProfileContent } from "@/components/people/person-profile-content";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";

export const metadata: Metadata = {
  description: "View person profile, availability history, and balances.",
  title: "Person Profile - Team Calendar",
};

interface PersonProfilePageProps {
  params: Promise<{ personId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PersonIdSchema = z.string().uuid();

const PersonProfilePage = async ({
  params,
  searchParams,
}: PersonProfilePageProps) => {
  await requirePageRole("org:viewer");
  const { personId: personIdParam } = await params;
  const personId = PersonIdSchema.safeParse(personIdParam);
  if (!personId.success) {
    notFound();
  }

  const viewModel = await loadProfileViewModel(
    personId.data,
    await searchParams
  );

  return (
    <>
      <Header page="People" />
      <main className="flex flex-1 flex-col p-6 pt-0">
        <div className="mx-auto w-full max-w-[720px] rounded-2xl bg-background p-6">
          <PersonProfileContent {...viewModel} />
        </div>
      </main>
    </>
  );
};

export default PersonProfilePage;

async function loadProfileViewModel(
  personId: string,
  searchParams: Record<string, string | string[] | undefined>
) {
  const org = searchParams.org;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);
  const [{ orgRole }, user] = await Promise.all([auth(), currentUser()]);
  const role = effectiveRole(orgRole);
  if (!(role && user)) {
    notFound();
  }

  const actingPerson = await database.person.findFirst({
    where: {
      ...scopedQuery(clerkOrgId, organisationId),
      archived_at: null,
      clerk_user_id: user.id,
    },
    select: { id: true },
  });

  const profileResult = await getPersonProfile({
    actingPersonId: actingPerson?.id ?? null,
    actingUserId: user.id,
    clerkOrgId,
    organisationId,
    personId,
    role,
  });
  if (!profileResult.ok) {
    notFound();
  }

  const historyResult = await listHistoryPage({
    clerkOrgId,
    cursor: firstString(searchParams.historyCursor),
    organisationId,
    pageSize: 25,
    personId,
  });

  return {
    balanceRefreshEnabled: true,
    canManageAlternativeContacts: canManageContacts(
      profileResult.value,
      actingPerson?.id ?? null,
      role
    ),
    canRefreshBalances: role === "admin" || role === "owner",
    history: historyResult.ok
      ? historyResult.value
      : { nextCursor: null, records: [] },
    initialTab:
      firstString(searchParams.tab) === "history" ? "history" : "upcoming",
    organisationId,
    orgQueryValue,
    profile: profileResult.value,
  } as const;
}

function canManageContacts(
  profile: PersonProfile,
  actingPersonId: string | null,
  role: PeopleRole
): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    actingPersonId === profile.header.id ||
    actingPersonId === profile.header.manager?.id
  );
}

function effectiveRole(role: string | null | undefined): PeopleRole | null {
  if (role === "org:owner") {
    return "owner";
  }
  if (role === "org:admin") {
    return "admin";
  }
  if (role === "org:manager") {
    return "manager";
  }
  if (role === "org:viewer") {
    return "viewer";
  }
  return null;
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
