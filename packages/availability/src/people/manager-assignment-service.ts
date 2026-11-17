import { hasPermission } from "@repo/auth/permissions";
import "server-only";
import type { Result } from "@repo/core";
import {
  assertTenantDb,
  resolveAccountCompanies,
  type TenantDb,
} from "@repo/database";
import { z } from "zod";

const InputSchema = z.object({
  accountId: z.string().min(1),
  actingRole: z.enum(["owner", "admin", "manager", "viewer"]),
  actingUserId: z.string().min(1),
  managerPersonId: z.string().uuid().nullable(),
  personId: z.string().uuid(),
});
export interface ManagerAssignmentError {
  code: "not_authorised" | "not_found" | "validation_error";
  message: string;
}
const failure = (
  code: ManagerAssignmentError["code"],
  message: string
): Result<never, ManagerAssignmentError> => ({
  error: { code, message },
  ok: false,
});
export async function setPersonManager(
  input: z.input<typeof InputSchema>,
  db: TenantDb
): Promise<Result<{ managerPersonId: string | null }, ManagerAssignmentError>> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return failure("validation_error", "Invalid manager assignment.");
  }
  assertTenantDb(db, parsed.data.accountId);
  if (!hasPermission(parsed.data.actingRole, { people: ["manage"] })) {
    return failure(
      "not_authorised",
      "Only owners and admins can assign managers."
    );
  }
  if (parsed.data.personId === parsed.data.managerPersonId) {
    return failure("validation_error", "A person cannot manage themselves.");
  }
  // Serialise graph edits for the account so simultaneous A->B and B->A cannot both pass.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-calendar:manager-assignment:${parsed.data.accountId}`}, 0))::text AS acquired`;
  const companyIds = (
    await resolveAccountCompanies(parsed.data.accountId, db)
  ).map((company) => company.id);
  const people = await db.person.findMany({
    select: { id: true, manager_person_id: true, organisation_id: true },
    where: {
      account_id: parsed.data.accountId,
      archived_at: null,
      organisation_id: { in: companyIds },
    },
  });
  const byId = new Map(
    people.map((preparedPerson) => [preparedPerson.id, preparedPerson])
  );
  const person = byId.get(parsed.data.personId);
  if (!person) {
    return failure("not_found", "Person not found.");
  }
  if (parsed.data.managerPersonId && !byId.has(parsed.data.managerPersonId)) {
    return failure(
      "not_found",
      "Choose a non-archived manager in this account."
    );
  }
  let ancestor = parsed.data.managerPersonId;
  const visited = new Set<string>();
  while (ancestor) {
    if (ancestor === person.id || visited.has(ancestor)) {
      return failure(
        "validation_error",
        "This assignment would create a manager cycle."
      );
    }
    visited.add(ancestor);
    ancestor = byId.get(ancestor)?.manager_person_id ?? null;
  }
  if (person.manager_person_id === parsed.data.managerPersonId) {
    return { ok: true, value: { managerPersonId: person.manager_person_id } };
  }
  const updated = await db.person.updateMany({
    data: { manager_person_id: parsed.data.managerPersonId },
    where: {
      account_id: parsed.data.accountId,
      archived_at: null,
      id: person.id,
      manager_person_id: person.manager_person_id,
      organisation_id: person.organisation_id,
    },
  });
  if (updated.count !== 1) {
    return failure(
      "validation_error",
      "The person's manager changed. Reload and try again."
    );
  }
  await db.auditEvent.create({
    data: {
      account_id: parsed.data.accountId,
      action: "people.manager_assigned",
      actor_user_id: parsed.data.actingUserId,
      after_value: { managerPersonId: parsed.data.managerPersonId },
      before_value: { managerPersonId: person.manager_person_id },
      entity_id: person.id,
      entity_type: "person",
      organisation_id: person.organisation_id,
      resource_id: person.id,
      resource_type: "person",
    },
  });
  return { ok: true, value: { managerPersonId: parsed.data.managerPersonId } };
}
export interface ManagerChoice {
  companyName: string;
  id: string;
  name: string;
}
export async function listManagerChoices(
  accountId: string,
  db: TenantDb
): Promise<ManagerChoice[]> {
  assertTenantDb(db, accountId);
  const companies = await resolveAccountCompanies(accountId, db);
  const names = new Map(companies.map((company) => [company.id, company.name]));
  const people = await db.person.findMany({
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
    select: {
      first_name: true,
      id: true,
      last_name: true,
      organisation_id: true,
    },
    where: {
      account_id: accountId,
      archived_at: null,
      organisation_id: { in: companies.map((company) => company.id) },
    },
  });
  return people.map((person) => ({
    companyName: names.get(person.organisation_id) ?? "",
    id: person.id,
    name: `${person.first_name} ${person.last_name}`.trim(),
  }));
}
