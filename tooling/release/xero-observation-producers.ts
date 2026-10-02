import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import {
  matchRawProviderLeave,
  rawProviderDate,
  readIndependentAuLeave,
} from "./e2e/xero-provider-oracle.js";
import {
  persistXeroLayerReceipt,
  type XeroLayerReceipt,
} from "./xero-observations.js";
import { requireXeroObserverAuthority } from "./xero-observer-authority.js";
import { scenarioDefinition, XERO_SUBCASE_IDS } from "./xero-scenarios.js";

const alias = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const contextSchema = z.strictObject({
  actionCompletedAt: z.iso.datetime(),
  fixtureAlias: z.string().regex(/^fixture-[a-z0-9-]+$/),
  observationId: z.string().refine((id) => XERO_SUBCASE_IDS.includes(id)),
  operationAlias: alias.nullable(),
  startedAt: z.iso.datetime(),
});
const leaveSchema = z.strictObject({
  approvalStatus: z.string().regex(/^[a-z_]+$/),
  employeeId: z.uuid(),
  endsAt: z.iso.date(),
  leaveTypeId: z.uuid(),
  personId: z.uuid(),
  rawApplicationStatuses: z.array(z.string().min(1)).max(10),
  rawPeriodStatuses: z.array(z.string().min(1)).min(1).max(10),
  recordId: z.uuid(),
  remoteId: z.string().min(1).max(128),
  sourceType: z.enum(["xero_leave", "team_calendar_leave"]),
  startsAt: z.iso.date(),
  units: z.number().nonnegative(),
});
const leaveInputSchema = contextSchema.extend({ expected: leaveSchema });
export type XeroLeaveObservationInput = z.infer<typeof leaveInputSchema>;
const canonicalLeaveSchema = z.object({
  approval_status: z.string(),
  employee_id: z.string(),
  ends_at: z.iso.date(),
  id: z.uuid(),
  person_id: z.uuid(),
  source_payload_json: z.unknown(),
  source_remote_id: z.string().nullable(),
  source_type: z.string(),
  starts_at: z.iso.date(),
  updated_at: z.iso.datetime(),
});
const operationInputSchema = contextSchema.extend({
  expected: z.strictObject({
    action: z.enum(["submit", "approve"]),
    employeeId: z.uuid(),
    endsAt: z.iso.date(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    leaveTypeId: z.uuid(),
    operationId: z.uuid(),
    recordId: z.uuid(),
    remoteId: z.string().min(1).max(128),
    startsAt: z.iso.date(),
    units: z.number().nonnegative(),
  }),
  operationAlias: alias,
});
export type XeroOperationObservationInput = z.infer<
  typeof operationInputSchema
>;
const operationSchema = z.object({
  action: z.string(),
  availability_record_id: z.uuid(),
  completed_at: z.iso.datetime().nullable(),
  dispatch_started_at: z.iso.datetime().nullable(),
  id: z.uuid(),
  known_remote_id: z.string().nullable(),
  prepared_at: z.iso.datetime(),
  provider_accepted_at: z.iso.datetime().nullable(),
  request_employee_id: z.string().nullable(),
  request_ends_at: z.iso.date().nullable(),
  request_fingerprint: z.string(),
  request_leave_type_id: z.string().nullable(),
  request_starts_at: z.iso.date().nullable(),
  request_units: z.number().nullable(),
  status: z.string(),
});
function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function assertWindow(
  input: z.infer<typeof contextSchema>,
  context: { createdAt: string; expiresAt: string },
  observedAt = new Date().toISOString()
) {
  const started = Date.parse(input.startedAt);
  const completed = Date.parse(input.actionCompletedAt);
  const observed = Date.parse(observedAt);
  if (
    started < Date.parse(context.createdAt) ||
    completed < started ||
    completed > observed ||
    observed > Date.parse(context.expiresAt)
  ) {
    throw new Error("Observation is outside the causal runner window");
  }
  return observedAt;
}
function assertLiveCase(input: z.infer<typeof contextSchema>) {
  const definition = scenarioDefinition(input.observationId.split(".")[0]);
  if (
    definition.requiredMode !== "LIVE" ||
    input.observationId.startsWith("X26.")
  ) {
    throw new Error(
      "LIVE action producer cannot supply controlled or terminal evidence"
    );
  }
}
function assertOwnedLeave(
  expected: Pick<
    z.infer<typeof leaveSchema>,
    "employeeId" | "leaveTypeId" | "startsAt" | "endsAt"
  >,
  authority: Awaited<ReturnType<typeof requireXeroObserverAuthority>>
) {
  if (
    !(
      authority.fixture.permittedOperations.includes("read") &&
      authority.fixture.employeeIds.includes(expected.employeeId) &&
      authority.fixture.leaveTypeIds.includes(expected.leaveTypeId)
    ) ||
    expected.startsAt > expected.endsAt ||
    expected.startsAt < authority.manifest.dateWindow.from ||
    expected.endsAt > authority.manifest.dateWindow.until
  ) {
    throw new Error(
      "Observation intent is outside owned employee, type or dates"
    );
  }
}
function writeReceipt(
  input: z.infer<typeof contextSchema>,
  authority: Awaited<ReturnType<typeof requireXeroObserverAuthority>>,
  layer: "database" | "operation" | "provider" | "worker",
  actual: unknown,
  expected: unknown,
  observedAt: string,
  terminal: XeroLayerReceipt["terminal"],
  correlation: { eventAlias: string; logicalRunAlias: string } | null = null
) {
  const actualFingerprint = fingerprint(actual);
  const expectedFingerprint = fingerprint(expected);
  const receipt: XeroLayerReceipt = {
    actualFingerprint,
    assertionPassed: actualFingerprint === expectedFingerprint,
    candidateSha: authority.context.candidateSha,
    eventAlias: correlation?.eventAlias ?? null,
    expectedFingerprint,
    fixtureAlias: authority.fixture.alias,
    intercepted: false,
    layer,
    logicalRunAlias: correlation?.logicalRunAlias ?? null,
    mode: "LIVE",
    observationId: input.observationId,
    observedAt,
    operationAlias: input.operationAlias,
    origin: layer === "provider" ? "https://api.xero.com" : null,
    runId: authority.context.runId,
    schemaVersion: 1,
    terminal,
  };
  const path = resolve(
    authority.context.output,
    `${input.observationId}-${layer}.json`
  );
  persistXeroLayerReceipt(path, receipt, authority.context.output);
  return { layer, path, receipt };
}
function canonicalProjection(row: z.infer<typeof canonicalLeaveSchema>) {
  const storedLeave = z.object({
    LeaveApplicationID: z.string().min(1),
    LeavePeriods: z
      .array(z.object({ NumberOfUnits: z.number().nonnegative() }))
      .min(1),
    LeaveTypeID: z.string().min(1),
  });
  const direct = storedLeave.safeParse(row.source_payload_json);
  const payloads = direct.success
    ? [direct.data]
    : z
        .object({
          LeaveApplications: z.array(storedLeave),
        })
        .parse(row.source_payload_json).LeaveApplications;
  const matches = payloads.filter(
    (entry) => entry.LeaveApplicationID === row.source_remote_id
  );
  const [payload] = matches;
  if (matches.length !== 1 || !payload) {
    throw new Error(
      "Canonical raw payload has no unique matching remote identity"
    );
  }
  return {
    approvalStatus: row.approval_status,
    employeeId: row.employee_id,
    endsAt: row.ends_at,
    leaveTypeId: payload.LeaveTypeID,
    personId: row.person_id,
    recordId: row.id,
    remoteId: row.source_remote_id,
    sourceType: row.source_type,
    startsAt: row.starts_at,
    units: payload.LeavePeriods.reduce(
      (sum, period) => sum + period.NumberOfUnits,
      0
    ),
  };
}

// The defaults execute real scoped reads. Unit tests replace transports, never campaign evidence.
export async function produceXeroLeaveObservations(
  value: XeroLeaveObservationInput
) {
  const input = leaveInputSchema.parse(value);
  assertLiveCase(input);
  const authority = await requireXeroObserverAuthority(input.fixtureAlias);
  assertWindow(input, authority.context);
  assertOwnedLeave(input.expected, authority);
  const pool = new Pool({ connectionString: authority.databaseUrl });
  try {
    const rows = await authority.readOnly(pool, async (client) => {
      const result = await client.query(
        `SELECT ar.id, ar.person_id, ar.source_type, ar.source_remote_id,
          ar.approval_status, ar.starts_at::date::text AS starts_at,
          ar.ends_at::date::text AS ends_at, ar.source_payload_json,
          to_char(ar.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          p.xero_employee_id AS employee_id
        FROM availability_records ar
        JOIN people p ON p.id=ar.person_id AND p.clerk_org_id=ar.clerk_org_id
          AND p.organisation_id=ar.organisation_id
        WHERE ar.clerk_org_id=$1 AND ar.organisation_id=$2::uuid AND ar.id=$3::uuid
          AND ar.person_id=$4::uuid AND p.xero_employee_id=$5
          AND ar.archived_at IS NULL`,
        [
          authority.fixture.clerkOrgId,
          authority.fixture.organisationId,
          input.expected.recordId,
          input.expected.personId,
          input.expected.employeeId,
        ]
      );
      return z.array(canonicalLeaveSchema).parse(result.rows);
    });
    const { rawApplicationStatuses, rawPeriodStatuses, ...expected } =
      input.expected;
    const databaseObservedAt = assertWindow(input, authority.context);
    const database = writeReceipt(
      input,
      authority,
      "database",
      {
        records: rows.map(canonicalProjection),
        updatedDuringAction:
          rows.length === 1 &&
          Date.parse(rows[0].updated_at) >= Date.parse(input.startedAt) &&
          Date.parse(rows[0].updated_at) <= Date.parse(databaseObservedAt),
      },
      { records: [expected], updatedDuringAction: true },
      databaseObservedAt,
      "succeeded"
    );
    const provider = await authority.observeProvider(() =>
      readIndependentAuLeave({
        assertAuthority: authority.assertCurrent,
        bindingGeneration: authority.fixture.bindingGeneration,
        clerkOrgId: authority.fixture.clerkOrgId,
        expectedTenantId: authority.fixture.xeroTenantId,
        organisationId: authority.fixture.organisationId,
        providerAppId: z.string().min(1).parse(process.env.XERO_CLIENT_ID),
        // Enumerate rather than reading just the known ID, so duplicates stay visible.
        remoteId: null,
      })
    );
    await authority.assertCurrent();
    assertWindow(input, authority.context, provider.observedAt);
    if (
      !provider.complete ||
      provider.intercepted ||
      provider.origin !== "https://api.xero.com"
    ) {
      throw new Error(
        "Independent provider observation is incomplete or intercepted"
      );
    }
    const matches = matchRawProviderLeave(provider.payload, {
      ...input.expected,
      rawApplicationStatuses,
      rawPeriodStatuses,
      remoteId: null,
    });
    const identityMatches = provider.payload.LeaveApplications.filter(
      (row) =>
        row.EmployeeID === input.expected.employeeId &&
        row.LeaveTypeID === input.expected.leaveTypeId &&
        rawProviderDate(row.StartDate) === input.expected.startsAt &&
        rawProviderDate(row.EndDate) === input.expected.endsAt &&
        Math.abs(
          row.LeavePeriods.reduce(
            (sum, period) => sum + period.NumberOfUnits,
            0
          ) - input.expected.units
        ) < 0.000_001
    );
    const providerReceipt = writeReceipt(
      input,
      authority,
      "provider",
      {
        identityRemoteIds: identityMatches
          .map((row) => row.LeaveApplicationID)
          .sort(),
        remoteIds: matches.map((row) => row.LeaveApplicationID).sort(),
      },
      {
        identityRemoteIds: [input.expected.remoteId],
        remoteIds: [input.expected.remoteId],
      },
      provider.observedAt,
      "succeeded"
    );
    return [database, providerReceipt];
  } finally {
    await pool.end();
  }
}

export async function produceXeroOperationObservation(
  value: XeroOperationObservationInput
) {
  const input = operationInputSchema.parse(value);
  assertLiveCase(input);
  const authority = await requireXeroObserverAuthority(input.fixtureAlias);
  assertWindow(input, authority.context);
  assertOwnedLeave(input.expected, authority);
  const pool = new Pool({ connectionString: authority.databaseUrl });
  try {
    const rows = await authority.readOnly(pool, async (client) => {
      const result = await client.query(
        `SELECT id, availability_record_id, action, status, request_fingerprint,
          request_employee_id, request_leave_type_id,
          request_starts_at::date::text AS request_starts_at,
          request_ends_at::date::text AS request_ends_at, request_units::float8,
          known_remote_id,
          to_char(prepared_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS prepared_at,
          to_char(dispatch_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS dispatch_started_at,
          to_char(provider_accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS provider_accepted_at,
          to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at
        FROM outbound_operations
        WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND id=$3::uuid
          AND availability_record_id=$4::uuid AND action::text=$5`,
        [
          authority.fixture.clerkOrgId,
          authority.fixture.organisationId,
          input.expected.operationId,
          input.expected.recordId,
          input.expected.action,
        ]
      );
      return z.array(operationSchema).parse(result.rows);
    });
    const observedAt = assertWindow(input, authority.context);
    const actual = rows.map((row) => ({
      action: row.action,
      employeeId: row.request_employee_id,
      endsAt: row.request_ends_at,
      fingerprint: row.request_fingerprint,
      leaveTypeId: row.request_leave_type_id,
      operationId: row.id,
      recordId: row.availability_record_id,
      remoteId: row.known_remote_id,
      startsAt: row.request_starts_at,
      units: row.request_units,
    }));
    const terminal =
      rows.length === 1 && rows[0].status === "completed"
        ? "succeeded"
        : "failed";
    const ordered = rows.every((row) => {
      if (
        !(
          row.dispatch_started_at &&
          row.provider_accepted_at &&
          row.completed_at
        )
      ) {
        return false;
      }
      const times = [
        input.startedAt,
        row.prepared_at,
        row.dispatch_started_at,
        row.provider_accepted_at,
        row.completed_at,
        observedAt,
      ].map(Date.parse);
      return times.every(
        (time, index) => index === 0 || time >= times[index - 1]
      );
    });
    return writeReceipt(
      input,
      authority,
      "operation",
      {
        operations: actual,
        ordered,
        terminal,
      },
      { operations: [input.expected], ordered: true, terminal: "succeeded" },
      observedAt,
      terminal
    );
  } finally {
    await pool.end();
  }
}

function scheduledSlot(startedAt: string) {
  const date = new Date(startedAt);
  date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 15) * 15, 0, 0);
  return `${date.toISOString().slice(0, 16)}Z`;
}

const scheduledInputSchema = contextSchema.extend({
  deadline: z.iso.datetime(),
  dispatchId: z.uuid(),
  expected: z.strictObject({
    employeeId: z.uuid(),
    logicalRunId: z.uuid(),
    personId: z.uuid(),
    recordId: z.uuid(),
    remoteId: z.string().min(1).max(128),
  }),
  observationId: z.literal("X08.primary"),
});
export type XeroScheduledObservationInput = z.infer<
  typeof scheduledInputSchema
>;
const runEnvelopeSchema = z.object({
  data: z.object({
    cron: z.string().nullish(),
    ended_at: z.iso.datetime().nullish(),
    environment_id: z.string().min(1),
    event_id: z.string().min(1),
    original_run_id: z.string().nullish(),
    output: z.unknown(),
    run_id: z.string().min(1),
    run_started_at: z.iso.datetime(),
    status: z.enum([
      "Running",
      "Scheduled",
      "Completed",
      "Failed",
      "Cancelled",
    ]),
  }),
  metadata: z.object({ fetchedAt: z.iso.datetime() }),
});
const scheduledRunSchema = z.object({
  completed_at: z.iso.datetime().nullable(),
  id: z.uuid(),
  records_failed: z.number().int().nonnegative(),
  run_type: z.string(),
  started_at: z.iso.datetime(),
  status: z.string(),
  trigger_type: z.string(),
});
const scheduledRecordSchema = z.object({
  employee_id: z.string().nullable(),
  id: z.uuid(),
  person_id: z.uuid(),
  source_remote_id: z.string().min(1),
  updated_at: z.iso.datetime(),
});
async function readInngestRun(
  runId: string,
  authority: Awaited<ReturnType<typeof requireXeroObserverAuthority>>,
  input: XeroScheduledObservationInput
) {
  await authority.assertCurrent();
  const key = z.string().min(1).parse(process.env.INNGEST_SIGNING_KEY);
  // https://api-docs.inngest.com/v1/function-runs/GetRun documents this authenticated read.
  const response = await fetch(
    `https://api.inngest.com/v1/runs/${encodeURIComponent(runId)}`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${key}` },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) {
    throw new Error("Scheduled worker read-back is unavailable");
  }
  const envelope = runEnvelopeSchema.parse(await response.json());
  await authority.assertCurrent();
  const observedAt = assertWindow(input, authority.context);
  if (
    envelope.data.run_id !== runId ||
    envelope.data.environment_id !== authority.manifest.workers.environmentId ||
    envelope.data.original_run_id ||
    Date.parse(envelope.metadata.fetchedAt) <
      Date.parse(input.actionCompletedAt) ||
    Date.parse(envelope.metadata.fetchedAt) > Date.parse(observedAt) ||
    Date.parse(observedAt) - Date.parse(envelope.metadata.fetchedAt) > 30_000
  ) {
    throw new Error(
      "Scheduled run identity, environment or read-back freshness disagrees"
    );
  }
  return envelope.data;
}
function causalTimes(
  values: readonly (string | null | undefined)[],
  from: string,
  until: string
) {
  return (
    values.every(
      (value) =>
        value !== null &&
        value !== undefined &&
        Date.parse(value) >= Date.parse(from) &&
        Date.parse(value) <= Date.parse(until)
    ) &&
    values.every(
      (value, index) =>
        index === 0 ||
        Date.parse(value ?? "") >= Date.parse(values[index - 1] ?? "")
    )
  );
}

// A persisted scheduled label alone is insufficient: require the scheduler ticket,
// actual Inngest executions and their exact logical database run to agree.
export async function produceXeroScheduledObservations(
  value: XeroScheduledObservationInput
) {
  const input = scheduledInputSchema.parse(value);
  const authority = await requireXeroObserverAuthority(input.fixtureAlias);
  const observedAt = assertWindow(input, authority.context);
  if (
    Date.parse(input.deadline) < Date.parse(observedAt) ||
    Date.parse(input.deadline) > Date.parse(authority.context.expiresAt) ||
    !authority.fixture.employeeIds.includes(input.expected.employeeId)
  ) {
    throw new Error(
      "Scheduled observation deadline or employee is outside authority"
    );
  }
  const control = await authority.readControl();
  const ticket = control.tickets.find(
    (entry) => entry.dispatchId === input.dispatchId
  );
  const resource = control.resources.find(
    (entry) => entry.organisationId === authority.fixture.organisationId
  );
  if (
    !(ticket && resource?.xeroTenantId) ||
    ticket.clerkOrgId !== authority.fixture.clerkOrgId ||
    ticket.organisationId !== authority.fixture.organisationId ||
    ticket.bindingGeneration !== authority.fixture.bindingGeneration ||
    ticket.functionId !== "sync-xero-leave-records" ||
    ticket.userId !== null ||
    !ticket.schedulerRunId ||
    !ticket.scheduledSlot ||
    ticket.eventIds.length !== 1 ||
    !ticket.workerRunId
  ) {
    throw new Error(
      "Scheduled observation has no exact attributed scheduler dispatch"
    );
  }
  const scheduler = await readInngestRun(
    ticket.schedulerRunId,
    authority,
    input
  );
  const worker = await readInngestRun(ticket.workerRunId, authority, input);
  if (
    [scheduler.status, worker.status].some((status) =>
      ["Running", "Scheduled"].includes(status)
    ) ||
    ["reserved", "running"].includes(ticket.outcome)
  ) {
    return null;
  }
  const pool = new Pool({ connectionString: authority.databaseUrl });
  try {
    const { runs, records } = await authority.readOnly(pool, async (client) => {
      const runResult = await client.query(
        `SELECT sr.id, sr.status, sr.trigger_type, sr.run_type, sr.records_failed,
          to_char(sr.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS started_at,
          to_char(sr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at
        FROM sync_runs sr JOIN xero_tenants xt ON xt.id=sr.xero_tenant_id
          AND xt.clerk_org_id=sr.clerk_org_id AND xt.organisation_id=sr.organisation_id
        WHERE sr.clerk_org_id=$1 AND sr.organisation_id=$2::uuid AND sr.id=$3::uuid
          AND sr.xero_tenant_id=$4::uuid AND xt.xero_tenant_id=$5
          AND xt.binding_generation=$6 AND xt.active_slot=1 AND xt.retired_at IS NULL`,
        [
          authority.fixture.clerkOrgId,
          authority.fixture.organisationId,
          input.expected.logicalRunId,
          resource.xeroTenantId,
          authority.fixture.xeroTenantId,
          authority.fixture.bindingGeneration,
        ]
      );
      const recordResult = await client.query(
        `SELECT ar.id, ar.person_id, ar.source_remote_id, p.xero_employee_id AS employee_id,
          to_char(ar.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
        FROM availability_records ar JOIN people p ON p.id=ar.person_id
          AND p.clerk_org_id=ar.clerk_org_id AND p.organisation_id=ar.organisation_id
        WHERE ar.clerk_org_id=$1 AND ar.organisation_id=$2::uuid AND ar.source_remote_id=$3
          AND ar.source_type IN ('xero_leave', 'team_calendar_leave') AND ar.archived_at IS NULL`,
        [
          authority.fixture.clerkOrgId,
          authority.fixture.organisationId,
          input.expected.remoteId,
        ]
      );
      return {
        records: z.array(scheduledRecordSchema).parse(recordResult.rows),
        runs: z.array(scheduledRunSchema).parse(runResult.rows),
      };
    });
    const latest = await authority.readControl();
    if (
      JSON.stringify(
        latest.tickets.find((entry) => entry.dispatchId === input.dispatchId)
      ) !== JSON.stringify(ticket)
    ) {
      throw new Error(
        "Scheduled dispatch changed during independent observation"
      );
    }
    const endedAt = assertWindow(input, authority.context);
    if (Date.parse(endedAt) > Date.parse(input.deadline)) {
      throw new Error("Scheduled observation exceeded its recorded deadline");
    }
    const correlation = {
      eventAlias: `event-${fingerprint(ticket.eventIds[0]).slice(0, 32)}`,
      logicalRunAlias: `sync-${fingerprint(input.expected.logicalRunId).slice(0, 32)}`,
    };
    const completion = z
      .object({
        ok: z.literal(true),
        value: z.object({ runId: z.uuid(), status: z.literal("succeeded") }),
      })
      .safeParse(worker.output);
    const [run] = runs;
    const schedulerPassed =
      scheduler.status === "Completed" &&
      scheduler.cron === "*/15 * * * *" &&
      ticket.scheduledSlot === scheduledSlot(scheduler.run_started_at) &&
      causalTimes(
        [scheduler.run_started_at, scheduler.ended_at],
        input.actionCompletedAt,
        endedAt
      );
    const workerPassed =
      worker.status === "Completed" &&
      ticket.outcome === "succeeded" &&
      ticket.eventIds.includes(worker.event_id) &&
      !worker.cron &&
      completion.success &&
      completion.data.value.runId === input.expected.logicalRunId &&
      causalTimes(
        [scheduler.run_started_at, worker.run_started_at, worker.ended_at],
        input.actionCompletedAt,
        endedAt
      );
    const databasePassed =
      runs.length === 1 &&
      run?.status === "succeeded" &&
      run.run_type === "leave_records" &&
      run.trigger_type === "scheduled" &&
      run.records_failed === 0 &&
      causalTimes(
        [
          worker.run_started_at,
          run.started_at,
          run.completed_at,
          worker.ended_at,
        ],
        input.actionCompletedAt,
        endedAt
      ) &&
      records.length === 1 &&
      records[0].id === input.expected.recordId &&
      records[0].person_id === input.expected.personId &&
      records[0].employee_id === input.expected.employeeId &&
      records[0].source_remote_id === input.expected.remoteId &&
      causalTimes(
        [run.started_at, records[0].updated_at, run.completed_at],
        input.actionCompletedAt,
        endedAt
      );
    return [
      writeReceipt(
        input,
        authority,
        "operation",
        { schedulerPassed },
        { schedulerPassed: true },
        endedAt,
        schedulerPassed ? "succeeded" : "failed",
        correlation
      ),
      writeReceipt(
        input,
        authority,
        "worker",
        { workerPassed },
        { workerPassed: true },
        endedAt,
        workerPassed ? "succeeded" : "failed",
        correlation
      ),
      writeReceipt(
        input,
        authority,
        "database",
        { databasePassed },
        { databasePassed: true },
        endedAt,
        databasePassed ? "succeeded" : "failed",
        correlation
      ),
    ];
  } finally {
    await pool.end();
  }
}
