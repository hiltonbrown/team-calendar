import { auth, currentUser } from "@repo/auth/server";
import {
  getPersonProfile,
  listHistoryPage,
  listManagerChoices,
  type PeopleRole,
  type PersonProfile,
} from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantDb,
} from "@repo/database";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { PersonProfileContent } from "@/components/people/person-profile-content";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { parsePersonProfileTab } from "@/lib/navigation/person-profile-tab";

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
  const orgParam = firstString(searchParams.org);
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  const role = effectiveRole(orgRole);
  if (!(orgId && role && user)) {
    notFound();
  }
  // Clerk supplied the authenticated account before opening the SQL scope.
  const clerkOrgId = orgId as ClerkOrgId;
  return withTenantDb(
    clerkOrgId,
    async (db) => {
      const companies = await resolveAccountCompanies(clerkOrgId, db);
      const target = await db.person.findFirst({
        select: { organisation_id: true },
        where: {
          clerk_org_id: clerkOrgId,
          id: personId,
          organisation_id: { in: companies.map((company) => company.id) },
        },
      });
      if (!target || (orgParam && orgParam !== target.organisation_id)) {
        notFound();
      }
      const organisationId = target.organisation_id;
      const orgQueryValue = organisationId;
      const actingPerson = await db.person.findFirst({
        select: { id: true },
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          clerk_user_id: user.id,
          organisation_id: { in: companies.map((company) => company.id) },
        },
      });

      const profileResult = await getPersonProfile(
        {
          actingPersonId: actingPerson?.id ?? null,
          actingUserId: user.id,
          clerkOrgId,
          organisationId,
          personId,
          role,
        },
        db
      );
      if (!profileResult.ok) {
        notFound();
      }

      const historyCursor = firstString(searchParams.historyCursor);
      const historyResult = await listHistoryPage(
        {
          actingPersonId: actingPerson?.id ?? null,
          clerkOrgId,
          cursor: historyCursor,
          organisationId,
          pageSize: 25,
          personId,
          role,
        },
        db
      );

      const canAssignManager = role === "owner" || role === "admin";
      const managerChoices = canAssignManager
        ? await listManagerChoices(clerkOrgId, db)
        : [];

      return {
        balanceRefreshEnabled: true,
        canAssignManager,
        canManageAlternativeContacts: canManageContacts(
          profileResult.value,
          actingPerson?.id ?? null,
          role
        ),
        canRefreshBalances: role === "admin" || role === "owner",
        history: historyResult.ok
          ? historyResult.value
          : { nextCursor: null, records: [] },
        initialTab: parsePersonProfileTab(searchParams.tab),
        managerChoices,
        organisationId,
        orgQueryValue,
        profile: profileResult.value,
      } as const;
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
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
