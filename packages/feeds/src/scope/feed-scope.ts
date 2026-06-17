import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
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
  organisationId: string;
  scopes: FeedScopeInput[];
}): Promise<Result<FeedScopeInput[], FeedScopeError>> {
  const parsed = FeedScopesSchema.safeParse(input.scopes);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    for (const scope of parsed.data) {
      if (scope.scopeType === "team") {
        const scopeValue = scope.scopeValue;
        if (!scopeValue) {
          return invalidScope();
        }
        const team = await database.team.findFirst({
          where: {
            clerk_org_id: input.clerkOrgId,
            id: scopeValue,
            organisation_id: input.organisationId,
          },
          select: { id: true },
        });
        if (!team) {
          return invalidScope();
        }
      }
      if (scope.scopeType === "person") {
        const scopeValue = scope.scopeValue;
        if (!scopeValue) {
          return invalidScope();
        }
        const person = await database.person.findFirst({
          where: {
            archived_at: null,
            clerk_org_id: input.clerkOrgId,
            id: scopeValue,
            organisation_id: input.organisationId,
          },
          select: { id: true },
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
  clerkOrgId: string;
  createdByUserId?: string | null;
  organisationId: string;
  preloaded?: FeedScopeData;
  scopes: FeedScopeInput[];
}): Promise<Result<ScopedFeedPerson[], FeedScopeError>> {
  try {
    const people =
      input.preloaded?.people.filter((person) => person.is_active) ??
      (await database.person.findMany({
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
        select: personSelect,
        where: {
          archived_at: null,
          clerk_org_id: input.clerkOrgId,
          is_active: true,
          organisation_id: input.organisationId,
        },
      }));

    const dynamicPerson = resolveDynamicPersonId({
      actingPersonId: input.actingPersonId ?? null,
      clerkOrgId: input.clerkOrgId,
      createdByUserId: input.createdByUserId ?? null,
      organisationId: input.organisationId,
      people,
    });

    const selected = new Map<string, ScopedFeedPerson>();
    for (const scope of input.scopes) {
      const scopedPeople = peopleForScope(scope, people, dynamicPerson);
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
  } catch {
    return unknownError("Failed to resolve feed scope.");
  }
}

export async function loadFeedScopeData(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<Result<FeedScopeData, FeedScopeError>> {
  try {
    const [people, teams] = await Promise.all([
      database.person.findMany({
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
        select: personSelect,
        where: {
          archived_at: null,
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
        },
      }),
      database.team.findMany({
        select: { id: true, name: true },
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
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
  organisationId: string;
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
          database.team.findMany({
            select: { id: true, name: true },
            where: {
              clerk_org_id: input.clerkOrgId,
              organisation_id: input.organisationId,
            },
          }),
          database.person.findMany({
            select: { first_name: true, id: true, last_name: true },
            where: {
              archived_at: null,
              clerk_org_id: input.clerkOrgId,
              organisation_id: input.organisationId,
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
  actingPersonId?: string | null;
  clerkOrgId: string;
  createdByUserId?: string | null;
  organisationId: string;
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
  organisationId: string;
  userId: string;
}): Promise<string | null> {
  const person = await database.person.findFirst({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      clerk_user_id: input.userId,
      organisation_id: input.organisationId,
    },
    select: { id: true },
  });
  return person?.id ?? null;
}

export function createScopeRows(input: {
  clerkOrgId: string;
  organisationId: string;
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

function resolveDynamicPersonId(input: {
  actingPersonId: string | null;
  clerkOrgId: string;
  createdByUserId: string | null;
  organisationId: string;
  people: PersonRow[];
}): string | null {
  if (input.createdByUserId) {
    const person = input.people.find(
      (candidate) => candidate.clerk_user_id === input.createdByUserId
    );
    if (person) {
      return person.id;
    }
  }
  return input.actingPersonId;
}

function peopleForScope(
  scope: FeedScopeInput,
  people: PersonRow[],
  dynamicPersonId: string | null
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
    return people.filter((person) => person.id === dynamicPersonId);
  }
  if (!dynamicPersonId) {
    return [];
  }
  return people.filter(
    (person) =>
      person.id === dynamicPersonId ||
      person.manager_person_id === dynamicPersonId
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
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid feed scope.",
    },
  };
}

function invalidScope(): Result<never, FeedScopeError> {
  return {
    ok: false,
    error: { code: "invalid_scope", message: "Feed scope is not available." },
  };
}

function unknownError(message: string): Result<never, FeedScopeError> {
  return { ok: false, error: { code: "unknown_error", message } };
}

const personSelect = {
  clerk_user_id: true,
  display_name: true,
  first_name: true,
  id: true,
  is_active: true,
  last_name: true,
  location_id: true,
  manager_person_id: true,
  team_id: true,
  location: {
    select: {
      country_code: true,
      id: true,
      name: true,
      region_code: true,
      timezone: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.PersonSelect;

type PersonRow = Prisma.PersonGetPayload<{ select: typeof personSelect }>;
