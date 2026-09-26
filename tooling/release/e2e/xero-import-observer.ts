import { z } from "zod";
import { rawProviderDate } from "./xero-provider-oracle.js";

const balanceSchema = z.object({
  LeaveTypeID: z.string().min(1),
  NumberOfUnits: z.number(),
  TypeOfUnits: z.enum(["Hours", "Days", "HOURS", "DAYS"]),
});
const employeeSchema = z.object({
  EmployeeID: z.string().min(1),
  LeaveBalances: z.array(balanceSchema).optional(),
});
const leaveSchema = z.object({
  EmployeeID: z.string().min(1),
  EndDate: z.string(),
  LeaveApplicationID: z.string().min(1),
  LeavePeriods: z
    .array(
      z.object({
        LeavePeriodStatus: z.string().min(1),
        NumberOfUnits: z.number(),
      })
    )
    .min(1),
  LeaveTypeID: z.string().min(1),
  StartDate: z.string(),
});
export const rawAuEnumerationSchema = z.strictObject({
  balances: z.array(employeeSchema),
  complete: z.literal(true),
  employeePages: z.number().int().positive(),
  employees: z.array(employeeSchema),
  intercepted: z.literal(false),
  leavePages: z.number().int().positive(),
  leaves: z.array(leaveSchema),
  observedAt: z.iso.datetime(),
  origin: z.literal("https://api.xero.com"),
});
export const canonicalImportSchema = z.strictObject({
  balances: z.array(
    z.strictObject({
      leaveTypeId: z.string().min(1),
      personId: z.uuid(),
      unit: z.enum(["hours", "days"]),
      value: z.number(),
    })
  ),
  bindingGeneration: z.number().int().nonnegative(),
  clerkOrgId: z.string().min(1),
  leaves: z.array(
    z.strictObject({
      endsAt: z.string(),
      personId: z.uuid(),
      rawLeaveTypeId: z.string().min(1),
      rawUnits: z.number(),
      sourceId: z.string().min(1),
      startsAt: z.string(),
    })
  ),
  observedAt: z.iso.datetime(),
  organisationId: z.uuid(),
  people: z.array(
    z.strictObject({ personId: z.uuid(), sourceId: z.string().min(1) })
  ),
  runs: z.array(
    z.strictObject({
      completedAt: z.iso.datetime(),
      entity: z.enum(["people", "leave_records", "leave_balances"]),
      failed: z.literal(0),
      fetched: z.number().int().nonnegative(),
      id: z.uuid(),
      startedAt: z.iso.datetime(),
      status: z.literal("succeeded"),
    })
  ),
  xeroTenantId: z.string().min(1),
});
export type RawAuEnumeration = z.infer<typeof rawAuEnumerationSchema>;
export type CanonicalImportObservation = z.infer<typeof canonicalImportSchema>;
function exactIds(actual: readonly string[], expected: readonly string[]) {
  if (
    new Set(actual).size !== actual.length ||
    new Set(expected).size !== expected.length ||
    actual.length !== expected.length ||
    actual.some((id) => !expected.includes(id))
  ) {
    throw new Error("Import source identity enumeration disagrees");
  }
}
export function assertIndependentInitialImport(
  rawValue: unknown,
  canonicalValue: unknown,
  scope: {
    clerkOrgId: string;
    organisationId: string;
    bindingGeneration: number;
    xeroTenantId: string;
    campaignStartedAt: string;
    expectedRunIds: readonly string[];
  }
) {
  const raw = rawAuEnumerationSchema.parse(rawValue);
  const canonical = canonicalImportSchema.parse(canonicalValue);
  const campaignStartedAt = Date.parse(
    z.iso.datetime().parse(scope.campaignStartedAt)
  );
  const expectedRunIds = z
    .array(z.uuid())
    .length(3)
    .parse(scope.expectedRunIds);
  exactIds(
    canonical.runs.map((run) => run.id),
    expectedRunIds
  );
  if (
    canonical.clerkOrgId !== scope.clerkOrgId ||
    canonical.organisationId !== scope.organisationId ||
    canonical.bindingGeneration !== scope.bindingGeneration ||
    canonical.xeroTenantId !== scope.xeroTenantId
  ) {
    throw new Error("Import canonical scope or generation is foreign");
  }
  exactIds(
    canonical.people.map((row) => row.sourceId),
    raw.employees.map((row) => row.EmployeeID)
  );
  exactIds(
    canonical.leaves.map((row) => row.sourceId),
    raw.leaves.map((row) => row.LeaveApplicationID)
  );
  const personBySource = new Map(
    canonical.people.map((person) => [person.sourceId, person.personId])
  );
  for (const leave of raw.leaves) {
    const row = canonical.leaves.find(
      (record) => record.sourceId === leave.LeaveApplicationID
    );
    if (
      !row ||
      row.personId !== personBySource.get(leave.EmployeeID) ||
      row.startsAt.slice(0, 10) !== rawProviderDate(leave.StartDate) ||
      row.endsAt.slice(0, 10) !== rawProviderDate(leave.EndDate) ||
      row.rawLeaveTypeId !== leave.LeaveTypeID ||
      Math.abs(
        row.rawUnits -
          leave.LeavePeriods.reduce(
            (sum, period) => sum + period.NumberOfUnits,
            0
          )
      ) > 0.000_001
    ) {
      throw new Error("Imported leave dates, person, type or units disagree");
    }
  }
  const expectedBalances = raw.balances.flatMap((employee) =>
    (employee.LeaveBalances ?? []).map((balance) => ({
      leaveTypeId: balance.LeaveTypeID,
      personId: personBySource.get(employee.EmployeeID),
      unit: balance.TypeOfUnits.toLowerCase(),
      value: balance.NumberOfUnits,
    }))
  );
  if (expectedBalances.some((row) => row.personId === undefined)) {
    throw new Error("Provider balance has no canonical person");
  }
  exactIds(
    canonical.balances.map((row) => `${row.personId}:${row.leaveTypeId}`),
    expectedBalances.map((row) => `${row.personId}:${row.leaveTypeId}`)
  );
  for (const balance of expectedBalances) {
    if (
      !canonical.balances.some(
        (row) =>
          row.personId === balance.personId &&
          row.leaveTypeId === balance.leaveTypeId &&
          Math.abs(row.value - balance.value) < 0.000_001 &&
          row.unit === balance.unit
      )
    ) {
      throw new Error(
        "Canonical balances invent or alter provider values or units"
      );
    }
  }
  const expectedCounts = {
    leave_balances: expectedBalances.length,
    leave_records: raw.leaves.length,
    people: raw.employees.length,
  };
  const observedUntil = Math.min(
    Date.parse(raw.observedAt),
    Date.parse(canonical.observedAt)
  );
  for (const entity of ["people", "leave_records", "leave_balances"] as const) {
    const runs = canonical.runs.filter(
      (candidate) => candidate.entity === entity
    );
    const [run] = runs;
    if (
      runs.length !== 1 ||
      !run ||
      run.fetched !== expectedCounts[entity] ||
      Date.parse(run.startedAt) < campaignStartedAt ||
      Date.parse(run.startedAt) > Date.parse(run.completedAt) ||
      Date.parse(run.completedAt) > observedUntil
    ) {
      throw new Error("Import stage counts, terminal run or timing disagrees");
    }
  }
  return {
    balanceCount: expectedBalances.length,
    employeeCount: raw.employees.length,
    employeePages: raw.employeePages,
    leaveCount: raw.leaves.length,
    leavePages: raw.leavePages,
    liveMultiplePages: raw.employeePages > 1 || raw.leavePages > 1,
  };
}
const scheduledSchema = z.strictObject({
  bindingGeneration: z.number().int().nonnegative(),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  canonicalRemoteIds: z.array(z.string().min(1)),
  clerkOrgId: z.string().min(1),
  completedAt: z.iso.datetime(),
  dispatchedAt: z.iso.datetime(),
  eventId: z.string().min(1),
  logicalRunId: z.uuid(),
  organisationId: z.uuid(),
  providerRemoteId: z.string().min(1),
  schedulerFunction: z.literal("schedule-xero-syncs"),
  terminal: z.literal("completed"),
  trigger: z.literal("scheduled"),
  uiRemoteIds: z.array(z.string().min(1)),
  workerFunction: z.literal("sync-xero-leave-records"),
  workerRunId: z.string().min(1),
  xeroTenantId: z.string().min(1),
});
export function assertActualScheduledDiscovery(
  value: unknown,
  expected: {
    candidateSha: string;
    clerkOrgId: string;
    organisationId: string;
    bindingGeneration: number;
    xeroTenantId: string;
    remoteId: string;
    startedAt: string;
    deadline: string;
  }
) {
  const observation = scheduledSchema.parse(value);
  if (
    observation.xeroTenantId !== expected.xeroTenantId ||
    observation.candidateSha !== expected.candidateSha ||
    observation.clerkOrgId !== expected.clerkOrgId ||
    observation.organisationId !== expected.organisationId ||
    observation.bindingGeneration !== expected.bindingGeneration ||
    observation.providerRemoteId !== expected.remoteId ||
    Date.parse(observation.dispatchedAt) < Date.parse(expected.startedAt) ||
    Date.parse(observation.completedAt) <
      Date.parse(observation.dispatchedAt) ||
    Date.parse(observation.completedAt) > Date.parse(expected.deadline) ||
    observation.canonicalRemoteIds.filter((id) => id === expected.remoteId)
      .length !== 1 ||
    observation.uiRemoteIds.filter((id) => id === expected.remoteId).length !==
      1
  ) {
    throw new Error(
      "Scheduled discovery has mismatched, stale, incomplete or duplicate evidence"
    );
  }
  return observation;
}

export async function waitForActualScheduledDiscovery(
  expected: Parameters<typeof assertActualScheduledDiscovery>[1],
  ports: {
    observe: () => Promise<unknown | null>;
    now: () => number;
    pause: (milliseconds: number) => Promise<void>;
    signal: AbortSignal;
  }
) {
  const deadline = Date.parse(expected.deadline);
  if (
    !Number.isFinite(deadline) ||
    deadline <= ports.now() ||
    deadline - ports.now() > 24 * 60 * 60_000
  ) {
    throw new Error("Scheduled discovery has no bounded test window");
  }
  while (ports.now() <= deadline) {
    ports.signal.throwIfAborted();
    const observed = await ports.observe();
    if (observed !== null) {
      return assertActualScheduledDiscovery(observed, expected);
    }
    const remaining = deadline - ports.now();
    if (remaining <= 0) {
      break;
    }
    await ports.pause(Math.min(20_000, remaining));
  }
  throw new Error(
    "Actual scheduled discovery exceeded its recorded processing deadline"
  );
}
