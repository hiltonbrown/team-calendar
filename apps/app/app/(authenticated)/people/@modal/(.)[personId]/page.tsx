import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
import {
  getPersonProfile,
  listHistoryPage,
  listManagerChoices,
  type PeopleRole,
  type PersonProfile,
} from "@repo/availability";
import type { AccountId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantDb,
} from "@repo/database";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { PersonProfileContent } from "@/components/people/person-profile-content";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
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
  await requirePagePermission({ people: ["read"] });
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
  const [{ accountId: sessionAccountId, role: sessionRole }, user] =
    await Promise.all([
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
    ]);
  const role = effectiveRole(sessionRole);
  if (!(sessionAccountId && role && user)) {
    notFound();
  }
  // Clerk supplied the authenticated account before opening the SQL scope.
  const accountId = sessionAccountId as AccountId;
  return withTenantDb(
    accountId,
    async (db) => {
      const companies = await resolveAccountCompanies(accountId, db);
      const target = await db.person.findFirst({
        select: { organisation_id: true },
        where: {
          account_id: accountId,
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
          account_id: accountId,
          archived_at: null,
          organisation_id: { in: companies.map((company) => company.id) },
          user_id: user.id,
        },
      });

      const profileResult = await getPersonProfile(
        {
          accountId,
          actingPersonId: actingPerson?.id ?? null,
          actingUserId: user.id,
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
          accountId,
          actingPersonId: actingPerson?.id ?? null,
          cursor: historyCursor,
          organisationId,
          pageSize: 25,
          personId,
          role,
        },
        db
      );

      const canAssignManager = can(role, { people: ["manage"] });
      const managerChoices = canAssignManager
        ? await listManagerChoices(accountId, db)
        : [];

      return {
        balanceRefreshEnabled: true,
        canAssignManager,
        canManageAlternativeContacts: canManageContacts(
          profileResult.value,
          actingPerson?.id ?? null,
          role
        ),
        canRefreshBalances: can(role, { people: ["manage"] }),
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
    can(role, { people: ["manage"] }) ||
    actingPersonId === profile.header.id ||
    actingPersonId === profile.header.manager?.id
  );
}

function effectiveRole(role: string | null | undefined): PeopleRole | null {
  if (role === "owner") {
    return "owner";
  }
  if (role === "admin") {
    return "admin";
  }
  if (role === "manager") {
    return "manager";
  }
  if (role === "viewer") {
    return "viewer";
  }
  return null;
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
