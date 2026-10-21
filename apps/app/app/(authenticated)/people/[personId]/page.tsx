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
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PersonProfileContent } from "@/components/people/person-profile-content";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { parsePersonProfileTab } from "@/lib/navigation/person-profile-tab";
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
      <div className="flex flex-1 flex-col p-6 pt-0">
        <div className="mx-auto w-full max-w-[720px] rounded-2xl bg-background p-6">
          <PersonProfileContent {...viewModel} />
        </div>
      </div>
    </>
  );
};

export default PersonProfilePage;

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

      const historyResult = await listHistoryPage(
        {
          actingPersonId: actingPerson?.id ?? null,
          clerkOrgId,
          cursor: firstString(searchParams.historyCursor),
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
