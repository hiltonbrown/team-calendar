import "server-only";

import type { Result } from "@repo/core";
import { resolveAccountCompanies, tenantDatabase } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type { feed_scope_rule_type } from "@repo/database/generated/enums";
import { z } from "zod";

export type FeedRole =
  | "admin"
  | "manager"
  | "owner"
  | "viewer"
  | `org:${string}`;
export type FeedScopeType = feed_scope_rule_type;

export type FeedScopeError =
  | { code: "invalid_scope"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface FeedScopeInput {
  scopeType: FeedScopeType;
  scopeValue?: string | null;
}

export interface ResolvedFeedScope {
  id: string;
  label: string;
  scopeType: FeedScopeType;
  scopeValue: string | null;
}

export interface ScopedFeedPerson {
  displayName: string;
  firstName: string;
  id: string;
  lastName: string;
  location: {
    countryCode: string | null;
    id: string;
    name: string;
    regionCode: string | null;
    timezone: string | null;
  } | null;
  locationId: string | null;
  managerPersonId: string | null;
  organisationId: string;
  team: { id: string; name: string } | null;
  teamId: string | null;
}

export interface FeedScopeData {
  // Keep this in step with scope features so preloaded and direct-query paths
  // resolve the same teams and people.
  people: PersonRow[];
  teams: { id: string; name: string }[];
}

export const FeedScopeSchema = z
  .object({
    scopeType: z.enum(["org", "team", "person", "self", "manager_team"]),
    scopeValue: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.scopeType === "team" || value.scopeType === "person") &&
      !value.scopeValue
    ) {
      context.addIssue({
        code: "custom",
        message: "This scope needs a selected value.",
        path: ["scopeValue"],
      });
    }
    if (
      (value.scopeType === "org" ||
        value.scopeType === "self" ||
        value.scopeType === "manager_team") &&
      value.scopeValue
    ) {
      context.addIssue({
        code: "custom",
        message: "This scope does not use a selected value.",
        path: ["scopeValue"],
      });
    }
  });

export const FeedScopesSchema = z.array(FeedScopeSchema).min(1);

export async function validateScopes(input: {
  clerkOrgId: string;
  organisationId: string | null;
  scopes: FeedScopeInput[];
}): Promise<Result<FeedScopeInput[], FeedScopeError>> {
  const parsed = FeedScopesSchema.safeParse(input.scopes);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    for (const scope of parsed.data) {
      if (scope.scopeType === "team") {
        const { scopeValue } = scope;
        if (!scopeValue) {
          return invalidScope();
        }
        const team = await tenantDatabase(input.clerkOrgId).team.findFirst({
          select: { id: true },
          where: {
            clerk_org_id: input.clerkOrgId,
            id: scopeValue,
            organisation_id: await companyWhere(input),
          },
        });
        if (!team) {
          return invalidScope();
        }
      }
      if (scope.scopeType === "person") {
        const { scopeValue } = scope;
        if (!scopeValue) {
          return invalidScope();
        }
        const person = await tenantDatabase(input.clerkOrgId).person.findFirst({
          select: { id: true },
          where: {
            archived_at: null,
            clerk_org_id: input.clerkOrgId,
            id: scopeValue,
            organisation_id: await companyWhere(input),
          },
        });
        if (!person) {
          return invalidScope();
        }
      }
    }
    return { ok: true, value: dedupeScopes(parsed.data) };
  } catch {
    return unknownError("Failed to validate feed scopes.");
  }
}

export async function resolvePeopleForFeed(input: {
  actingPersonId?: string | null;
  client?: Prisma.TransactionClient;
  clerkOrgId: string;
  createdByUserId?: string | null;
  organisationId: string | null;
  preloaded?: FeedScopeData;
  companyIds?: string[];
  scopes: FeedScopeInput[];
}): Promise<Result<ScopedFeedPerson[], FeedScopeError>> {
  try {
    const companyIds =
      input.organisationId === null
        ? (input.companyIds ??
          (await resolveAccountCompanies(input.clerkOrgId, input.client)).map(
            (company) => company.id
          ))
        : [input.organisationId];
    const candidates =
      input.preloaded?.people.filter((person) => person.is_active) ??
      (await (input.client ?? tenantDatabase(input.clerkOrgId)).person.findMany(
        {
          orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
          select: personSelect,
          where: peopleWhereForFeedScope(input, companyIds),
        }
      ));

    const people =
      input.organisationId === null
        ? candidates.filter(
            (person) =>
              person.clerk_org_id === input.clerkOrgId &&
              companyIds.includes(person.organisation_id)
          )
        : candidates;
    const dynamicPeople = resolveDynamicPersonIds({
      actingPersonId: input.actingPersonId ?? null,
      clerkOrgId: input.clerkOrgId,
      createdByUserId: input.createdByUserId ?? null,
      organisationId: input.organisationId,
      people,
    });

    const selected = new Map<string, ScopedFeedPerson>();
    for (const scope of input.scopes) {
      const scopedPeople = peopleForScope(scope, people, dynamicPeople);
      for (const person of scopedPeople) {
        selected.set(person.id, toScopedPerson(person));
      }
    }
    return {
      ok: true,
      value: [...selected.values()].sort((first, second) =>
        first.displayName.localeCompare(second.displayName)
      ),
    };
  } catch (error) {
    if (input.client) {
      throw error;
    }
    return unknownError("Failed to resolve feed scope.");
  }
}

export async function loadFeedScopeData(input: {
  clerkOrgId: string;
  organisationId: string | null;
}): Promise<Result<FeedScopeData, FeedScopeError>> {
  try {
    const [people, teams] = await Promise.all([
      tenantDatabase(input.clerkOrgId).person.findMany({
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
        select: personSelect,
        where: {
          archived_at: null,
          clerk_org_id: input.clerkOrgId,
          organisation_id: await companyWhere(input),
        },
      }),
      tenantDatabase(input.clerkOrgId).team.findMany({
        select: { id: true, name: true },
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: await companyWhere(input),
        },
      }),
    ]);

    return { ok: true, value: { people, teams } };
  } catch {
    return unknownError("Failed to load feed scope data.");
  }
}

export async function resolveScopeRows(input: {
  clerkOrgId: string;
  organisationId: string | null;
  preloaded?: FeedScopeData;
  scopes: Array<{
    id: string;
    scope_type: feed_scope_rule_type;
    scope_value: string | null;
  }>;
}): Promise<Result<ResolvedFeedScope[], FeedScopeError>> {
  try {
    const [teams, people] = input.preloaded
      ? [input.preloaded.teams, input.preloaded.people]
      : await Promise.all([
          tenantDatabase(input.clerkOrgId).team.findMany({
            select: { id: true, name: true },
            where: {
              clerk_org_id: input.clerkOrgId,
              organisation_id: await companyWhere(input),
            },
          }),
          tenantDatabase(input.clerkOrgId).person.findMany({
            select: { first_name: true, id: true, last_name: true },
            where: {
              archived_at: null,
              clerk_org_id: input.clerkOrgId,
              organisation_id: await companyWhere(input),
            },
          }),
        ]);
    const teamNames = new Map(teams.map((team) => [team.id, team.name]));
    const personNames = new Map(
      people.map((person) => [
        person.id,
        `${person.first_name} ${person.last_name}`,
      ])
    );

    return {
      ok: true,
      value: input.scopes.map((scope) => ({
        id: scope.id,
        label: labelForScope(scope, teamNames, personNames),
        scopeType: scope.scope_type,
        scopeValue: scope.scope_value,
      })),
    };
  } catch {
    return unknownError("Failed to resolve feed scopes.");
  }
}

export async function canViewFeed(input: {
  client?: Prisma.TransactionClient;
  actingPersonId?: string | null;
  clerkOrgId: string;
  createdByUserId?: string | null;
  organisationId: string | null;
  preloaded?: FeedScopeData;
  role: FeedRole;
  scopes: FeedScopeInput[];
}): Promise<Result<boolean, FeedScopeError>> {
  if (isAdminOrOwner(input.role)) {
    return { ok: true, value: true };
  }
  const actingPersonId = input.actingPersonId ?? null;
  if (!actingPersonId) {
    return { ok: true, value: false };
  }
  const peopleResult = await resolvePeopleForFeed(input);
  if (!peopleResult.ok) {
    return peopleResult;
  }
  if (input.role === "manager" || input.role === "org:manager") {
    const reportIds = transitiveReportIds(
      peopleResult.value.map((person) => ({
        id: person.id,
        manager_person_id: person.managerPersonId,
      })),
      actingPersonId
    );
    return {
      ok: true,
      value: peopleResult.value.some(
        (person) => person.id === actingPersonId || reportIds.has(person.id)
      ),
    };
  }
  return {
    ok: true,
    value: peopleResult.value.some((person) => person.id === actingPersonId),
  };
}

export function scopeSummary(
  scopes: FeedScopeInput[],
  labels?: ResolvedFeedScope[]
): string {
  if (scopes.some((scope) => scope.scopeType === "org")) {
    return "All organisation";
  }
  if (scopes.length === 1) {
    const [scope] = scopes;
    if (!scope) {
      return "No scope";
    }
    if (scope.scopeType === "self") {
      return "Just you";
    }
    if (scope.scopeType === "manager_team") {
      return "My team";
    }
    return labels?.[0]?.label ?? scope.scopeType;
  }
  const teamCount = scopes.filter((scope) => scope.scopeType === "team").length;
  const personCount = scopes.filter(
    (scope) => scope.scopeType === "person"
  ).length;
  if (teamCount > 0 && personCount === 0) {
    return `${teamCount} teams`;
  }
  if (personCount > 0 && teamCount === 0) {
    return `${personCount} people`;
  }
  return `${scopes.length} scopes`;
}

export function isAdminOrOwner(role: FeedRole): boolean {
  return (
    role === "admin" ||
    role === "owner" ||
    role === "org:admin" ||
    role === "org:owner"
  );
}

export function normaliseRole(role: string | null | undefined): FeedRole {
  if (
    role === "org:owner" ||
    role === "org:admin" ||
    role === "org:manager" ||
    role === "org:viewer"
  ) {
    return role;
  }
  if (role === "owner" || role === "admin" || role === "manager") {
    return role;
  }
  return "viewer";
}

export async function findActingPersonId(input: {
  clerkOrgId: string;
  organisationId: string | null;
  userId: string;
}): Promise<string | null> {
  const person = await tenantDatabase(input.clerkOrgId).person.findFirst({
    select: { id: true },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      clerk_user_id: input.userId,
      organisation_id: await companyWhere(input),
    },
  });
  return person?.id ?? null;
}

export function createScopeRows(input: {
  clerkOrgId: string;
  organisationId: string | null;
  scopes: FeedScopeInput[];
}) {
  return input.scopes.map((scope) => ({
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    scope_type: scope.scopeType,
    scope_value: scope.scopeValue ?? null,
  }));
}

function dedupeScopes(scopes: FeedScopeInput[]): FeedScopeInput[] {
  const seen = new Set<string>();
  const result: FeedScopeInput[] = [];
  for (const scope of scopes) {
    const key = `${scope.scopeType}:${scope.scopeValue ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        scopeType: scope.scopeType,
        scopeValue: scope.scopeValue ?? null,
      });
    }
  }
  return result;
}

function peopleWhereForFeedScope(
  input: {
    clerkOrgId: string;
    organisationId: string | null;
    scopes: FeedScopeInput[];
  },
  companyIds: string[]
): Prisma.PersonWhereInput {
  const where: Prisma.PersonWhereInput = {
    archived_at: null,
    clerk_org_id: input.clerkOrgId,
    is_active: true,
    organisation_id: input.organisationId ?? { in: companyIds },
  };
  const scopes = dedupeScopes(input.scopes);

  if (
    scopes.some(
      (scope) =>
        scope.scopeType === "org" ||
        scope.scopeType === "self" ||
        scope.scopeType === "manager_team"
    )
  ) {
    return where;
  }

  const personIds = scopes
    .filter(
      (scope): scope is FeedScopeInput & { scopeValue: string } =>
        scope.scopeType === "person" && typeof scope.scopeValue === "string"
    )
    .map((scope) => scope.scopeValue);
  const teamIds = scopes
    .filter(
      (scope): scope is FeedScopeInput & { scopeValue: string } =>
        scope.scopeType === "team" && typeof scope.scopeValue === "string"
    )
    .map((scope) => scope.scopeValue);
  const scopedWhere: Prisma.PersonWhereInput[] = [];

  if (personIds.length > 0) {
    scopedWhere.push({ id: { in: personIds } });
  }
  if (teamIds.length > 0) {
    scopedWhere.push({ team_id: { in: teamIds } });
  }

  return {
    ...where,
    OR: scopedWhere.length > 0 ? scopedWhere : [{ id: { in: [] } }],
  };
}

function resolveDynamicPersonIds(input: {
  actingPersonId: string | null;
  clerkOrgId: string;
  createdByUserId: string | null;
  organisationId: string | null;
  people: PersonRow[];
}): Set<string> {
  const linked = input.createdByUserId
    ? input.people
        .filter((person) => person.clerk_user_id === input.createdByUserId)
        .map((person) => person.id)
    : [];
  if (linked.length > 0) {
    return new Set(linked);
  }
  return new Set(input.actingPersonId ? [input.actingPersonId] : []);
}

function peopleForScope(
  scope: FeedScopeInput,
  people: PersonRow[],
  dynamicPersonIds: Set<string>
): PersonRow[] {
  if (scope.scopeType === "org") {
    return people;
  }
  if (scope.scopeType === "team") {
    return people.filter((person) => person.team_id === scope.scopeValue);
  }
  if (scope.scopeType === "person") {
    return people.filter((person) => person.id === scope.scopeValue);
  }
  if (scope.scopeType === "self") {
    return people.filter((person) => dynamicPersonIds.has(person.id));
  }
  if (dynamicPersonIds.size === 0) {
    return [];
  }
  return people.filter(
    (person) =>
      dynamicPersonIds.has(person.id) ||
      Boolean(
        person.manager_person_id &&
          dynamicPersonIds.has(person.manager_person_id)
      )
  );
}

function labelForScope(
  scope: {
    scope_type: feed_scope_rule_type;
    scope_value: string | null;
  },
  teamNames: Map<string, string>,
  personNames: Map<string, string>
): string {
  if (scope.scope_type === "org") {
    return "All organisation";
  }
  if (scope.scope_type === "self") {
    return "Just you";
  }
  if (scope.scope_type === "manager_team") {
    return "My team";
  }
  if (scope.scope_type === "team" && scope.scope_value) {
    return teamNames.get(scope.scope_value) ?? "Unknown team";
  }
  if (scope.scope_type === "person" && scope.scope_value) {
    return personNames.get(scope.scope_value) ?? "Unknown person";
  }
  return "Unknown scope";
}

function toScopedPerson(person: PersonRow): ScopedFeedPerson {
  const displayName =
    person.display_name ?? `${person.first_name} ${person.last_name}`;
  return {
    displayName,
    firstName: person.first_name,
    id: person.id,
    lastName: person.last_name,
    location: person.location
      ? {
          countryCode: person.location.country_code,
          id: person.location.id,
          name: person.location.name,
          regionCode: person.location.region_code,
          timezone: person.location.timezone,
        }
      : null,
    locationId: person.location_id,
    managerPersonId: person.manager_person_id,
    organisationId: person.organisation_id,
    team: person.team,
    teamId: person.team_id,
  };
}

function transitiveReportIds(
  people: Array<{ id: string; manager_person_id: string | null }>,
  actingPersonId: string
): Set<string> {
  const byManager = new Map<
    string,
    Array<{ id: string; manager_person_id: string | null }>
  >();
  for (const person of people) {
    if (!person.manager_person_id) {
      continue;
    }
    byManager.set(person.manager_person_id, [
      ...(byManager.get(person.manager_person_id) ?? []),
      person,
    ]);
  }
  const visited = new Set<string>();
  const queue = [...(byManager.get(actingPersonId) ?? [])];
  while (queue.length > 0) {
    const person = queue.shift();
    if (!person || visited.has(person.id)) {
      continue;
    }
    visited.add(person.id);
    queue.push(...(byManager.get(person.id) ?? []));
  }
  return visited;
}

function validationError(error: z.ZodError): Result<never, FeedScopeError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid feed scope.",
    },
    ok: false,
  };
}

function invalidScope(): Result<never, FeedScopeError> {
  return {
    error: { code: "invalid_scope", message: "Feed scope is not available." },
    ok: false,
  };
}

function unknownError(message: string): Result<never, FeedScopeError> {
  return { error: { code: "unknown_error", message }, ok: false };
}

const personSelect = {
  clerk_org_id: true,
  clerk_user_id: true,
  display_name: true,
  first_name: true,
  id: true,
  is_active: true,
  last_name: true,
  location: {
    select: {
      country_code: true,
      id: true,
      name: true,
      region_code: true,
      timezone: true,
    },
  },
  location_id: true,
  manager_person_id: true,
  organisation_id: true,
  team: {
    select: {
      id: true,
      name: true,
    },
  },
  team_id: true,
} satisfies Prisma.PersonSelect;

type PersonRow = Prisma.PersonGetPayload<{ select: typeof personSelect }>;

async function companyWhere(input: {
  clerkOrgId: string;
  organisationId: string | null;
}) {
  if (input.organisationId !== null) {
    return input.organisationId;
  }
  const companies = await resolveAccountCompanies(input.clerkOrgId);
  return { in: companies.map((company) => company.id) };
}
