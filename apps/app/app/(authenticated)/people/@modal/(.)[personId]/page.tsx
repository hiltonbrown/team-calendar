import { auth, currentUser } from "@repo/auth/server";
import {
  getPersonProfile,
  listHistoryPage,
  type PeopleRole,
  type PersonProfile,
} from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { PersonProfileContent } from "@/components/people/person-profile-content";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

interface PersonProfileModalPageProps {
  params: Promise<{ personId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PersonIdSchema = z.string().uuid();

const PersonProfileModalPage = async ({
  params,
  searchParams,
}: PersonProfileModalPageProps) => {
  await requirePageRole("org:viewer");
  const { personId: personIdParam } = await params;
  const personId = PersonIdSchema.safeParse(personIdParam);
  if (!personId.success) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const viewModel = await loadProfileViewModel(
    personId.data,
    resolvedSearchParams
  );

  return (
    <InterceptingModalShell size="wide">
      <PersonProfileContent {...viewModel} />
    </InterceptingModalShell>
  );
};

export default PersonProfileModalPage;

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

  const historyCursor = firstString(searchParams.historyCursor);
  const historyResult = await listHistoryPage({
    clerkOrgId,
    cursor: historyCursor,
    organisationId,
    pageSize: 25,
    personId,
  });

  return {
    balanceRefreshEnabled: false,
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
