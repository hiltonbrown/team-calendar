import { afterEach, expect, it, vi } from "vitest";

const originalInfo = console.info;
const originalDebug = console.debug;

const state = vi.hoisted(() => {
  const query: { sql: string; params: readonly unknown[] } = {
    params: [],
    sql: "",
  };
  return { end: vi.fn(), fingerprint: "fingerprint", output: vi.fn(), query };
});
vi.mock("pg", () => ({
  Pool: class {
    end = state.end;
    query(sql: string, params: readonly unknown[]) {
      state.query.sql = sql;
      state.query.params = params;
      const currentApproval = sql.includes("op.action = 'approve'");
      return Promise.resolve({
        rows: [
          {
            approval_status: "approved",
            clerk_org_id: "owned-account",
            known_remote_id: "remote-1",
            organisation_id: "owned-organisation",
            request_employee_id: currentApproval ? "employee-1" : null,
            request_ends_at: new Date("2026-10-02"),
            request_fingerprint: state.fingerprint,
            request_leave_type_id: "leave-1",
            request_starts_at: new Date("2026-10-01"),
            request_title: "Annual leave",
            request_units: "1",
            source_remote_id: "remote-1",
          },
        ],
      });
    }
  },
}));
vi.mock("../database-guard.js", () => ({
  assertLiveDatabaseAuthority: () => ({
    owned: {
      clerkOrgIds: ["owned-account"],
      organisationIds: ["owned-organisation"],
    },
    runId: "owned-run",
  }),
}));
vi.mock("../../../packages/xero/src/adapter/xero-write-adapter.js", () => ({
  XeroWriteAdapter: {
    findLeaveApplicationCandidates: async () => {
      const { log } = await import("../../../packages/observability/log.js");
      log.info("Xero transport response", { status: 200 });
      return {
        ok: true,
        value: {
          candidates: [
            {
              approvalStatus: "approved",
              employeeId: "employee-1",
              endsAt: "2026-10-02",
              leaveTypeId: "leave-1",
              remoteId: "remote-1",
              startsAt: "2026-10-01",
              title: "Annual leave",
              units: 16,
            },
          ],
          complete: true,
        },
      };
    },
  },
}));
vi.mock("../../../packages/availability/src/plans/submit-service.js", () => ({
  submitRequestFingerprint: (input: { units: number }) =>
    input.units === 1 ? "fingerprint" : "wrong-units",
}));

afterEach(() => {
  state.fingerprint = "fingerprint";
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  console.info = originalInfo;
  console.debug = originalDebug;
});

it("observes date-only AU create with provider hours differing from journal working days", async () => {
  vi.stubEnv("TC_RELEASE_DURABLE_VERIFIED", "owned-run");
  vi.stubEnv("TC_RELEASE_ACTIVE_RUN_VERIFIED", "owned-run");
  vi.spyOn(process, "argv", "get").mockReturnValue([
    "bun",
    "provider-snapshot-cli.ts",
    "11111111-1111-4111-8111-111111111111",
  ]);
  vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    state.output(value);
    return true;
  });
  const diagnostic = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const ordinaryStdout = vi
    .spyOn(console, "info")
    .mockImplementation(() => undefined);
  await import("./provider-snapshot-cli.js");
  expect(ordinaryStdout).not.toHaveBeenCalled();
  expect(diagnostic).toHaveBeenCalledWith("Xero transport response", {
    status: 200,
  });
  expect(JSON.parse(state.output.mock.calls[0]?.[0])).toMatchObject({
    approvalStatus: "approved",
    knownRemoteId: "remote-1",
    matches: [{ approvalStatus: "approved", remoteId: "remote-1" }],
  });
  expect(state.end).toHaveBeenCalledOnce();
});

it("refuses a changed original journal fingerprint before reporting a provider match", async () => {
  vi.resetModules();
  state.fingerprint = "tampered-fingerprint";
  vi.stubEnv("TC_RELEASE_DURABLE_VERIFIED", "owned-run");
  vi.stubEnv("TC_RELEASE_ACTIVE_RUN_VERIFIED", "owned-run");
  vi.spyOn(process, "argv", "get").mockReturnValue([
    "bun",
    "provider-snapshot-cli.ts",
    "11111111-1111-4111-8111-111111111111",
  ]);
  const output = vi.spyOn(process.stdout, "write");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(import("./provider-snapshot-cli.js")).rejects.toThrow(
    "request fingerprint is invalid"
  );
  expect(output).not.toHaveBeenCalled();
});

it.skipIf(process.env.ALLOW_LOCAL_DATABASE_TESTS !== "1")(
  "executes the actual snapshot SQL with both tenant boundaries and scoped operation join",
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { xeroSimplificationFixture } = await import(
      "../../../packages/database/src/test-fixtures/xero-simplification-fixture.js"
    );
    const { database } = xeroSimplificationFixture();
    const { sql, params: originalParams } = state.query;
    expect(typeof sql).toBe("string");
    const rollback = new Error("snapshot fixture rollback");
    try {
      await database
        .$transaction(async (tx) => {
          const createRecord = async () => {
            const clerkOrgId = `snapshot-fixture-${randomUUID()}`;
            const organisation = await tx.organisation.create({
              data: {
                clerk_org_id: clerkOrgId,
                country_code: "AU",
                name: "Owned snapshot fixture",
              },
            });
            const person = await tx.person.create({
              data: {
                clerk_org_id: clerkOrgId,
                email: `${clerkOrgId}@example.com`,
                employment_type: "employee",
                first_name: "Snapshot",
                last_name: "Fixture",
                organisation_id: organisation.id,
                source_system: "MANUAL",
              },
            });
            const record = await tx.availabilityRecord.create({
              data: {
                approval_status: "approved",
                clerk_org_id: clerkOrgId,
                contactability: "contactable",
                derived_uid_key: `snapshot:${randomUUID()}`,
                ends_at: new Date("2026-10-02"),
                organisation_id: organisation.id,
                person_id: person.id,
                privacy_mode: "named",
                record_type: "leave",
                source_type: "manual",
                starts_at: new Date("2026-10-01"),
              },
            });
            return {
              clerkOrgId,
              organisationId: organisation.id,
              recordId: record.id,
            };
          };
          const owned = await createRecord();
          const foreign = await createRecord();
          // Deliberately inconsistent legacy ownership must never expose a
          // sibling journal's request through a record in this account.
          await tx.outboundOperation.create({
            data: {
              action: "approve",
              actor_user_id: "fixture-user",
              availability_record_id: owned.recordId,
              clerk_org_id: foreign.clerkOrgId,
              organisation_id: foreign.organisationId,
              request_employee_id: "foreign-employee",
              request_fingerprint: "foreign-fingerprint",
              status: "completed",
            },
          });
          const query = (
            recordId: string,
            clerkOrgIds: string[],
            organisationIds: string[]
          ) => {
            const params = [recordId, clerkOrgIds, organisationIds].slice(
              0,
              originalParams.length
            );
            return tx.$queryRawUnsafe<
              Array<{ request_employee_id: string | null }>
            >(sql, ...params);
          };
          expect(
            await query(
              foreign.recordId,
              [owned.clerkOrgId],
              [owned.organisationId, foreign.organisationId]
            )
          ).toEqual([]);
          expect(
            await query(
              foreign.recordId,
              [owned.clerkOrgId, foreign.clerkOrgId],
              [owned.organisationId]
            )
          ).toEqual([]);
          const result = await query(
            owned.recordId,
            [owned.clerkOrgId],
            [owned.organisationId]
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.request_employee_id).toBeNull();
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) {
            throw error;
          }
        });
    } finally {
      await database.$disconnect();
    }
  }
);
