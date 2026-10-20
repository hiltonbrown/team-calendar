import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { isLocalDatabase } from "./src/is-local-database";
import { syncPlansFromCatalogue } from "./src/seed/plan-sync";
import { getPlanDefinition } from "./src/seed/plans";
import { systemDatabase } from "./src/system-client";
import { withTenantResult as withTestTenantResult } from "./src/tenant-db";
import { tenantTestAccount } from "./src/test-fixtures/tenant-scope";

const ownerUrl = process.env.DATABASE_URL;
if (!(ownerUrl && isLocalDatabase(ownerUrl))) {
  throw new Error(
    "Multi-company database fixtures require disposable local PostgreSQL"
  );
}

test("Premium projection updates an existing one-company limit to five idempotently", async () => {
  const key = `premium-projection-${randomUUID()}`;
  const plan = await systemDatabase.plan.create({
    data: { key, name: "Owned Premium projection", plan_key: key },
  });
  try {
    await systemDatabase.planLimit.create({
      data: {
        limit_type: "payroll_entities",
        limit_value: 1,
        plan_id: plan.id,
      },
    });
    const definition = { ...getPlanDefinition("premium"), plan_key: key };
    await syncPlansFromCatalogue(systemDatabase, [definition]);
    const after = await systemDatabase.planLimit.findMany({
      orderBy: { limit_type: "asc" },
      where: { plan_id: plan.id },
    });
    expect(
      after.find((limit) => limit.limit_type === "payroll_entities")
        ?.limit_value
    ).toBe(5);
    expect(getPlanDefinition("basic").limits.payroll_entities).toBe(1);
    await syncPlansFromCatalogue(systemDatabase, [definition]);
    const repeated = await systemDatabase.planLimit.findMany({
      orderBy: { limit_type: "asc" },
      where: { plan_id: plan.id },
    });
    expect(
      repeated.map(({ id, limit_type, limit_value }) => ({
        id,
        limit_type,
        limit_value,
      }))
    ).toEqual(
      after.map(({ id, limit_type, limit_value }) => ({
        id,
        limit_type,
        limit_value,
      }))
    );
  } finally {
    await systemDatabase.planLimit.deleteMany({ where: { plan_id: plan.id } });
    await systemDatabase.plan.delete({ where: { id: plan.id } });
  }
});

// Tenant request/approval routing is exercised against disposable local PostgreSQL,
// with provider calls replaced by a port that records immutable company identities.
test("B-employed leave and A-employed manager approval use only B's connection and payroll tenant", async () => {
  const { createRecord } = await import(
    "../availability/src/plans/plan-service"
  );
  const { submitDraftRecord } = await import(
    "../availability/src/plans/submit-service"
  );
  const { approve } = await import(
    "../availability/src/approvals/approval-service"
  );
  const { assertNoTenantTransaction } = await import("./src/tenant-db");
  const clerkOrgId = `leave-routing-${randomUUID()}`;
  const grants: string[] = [];
  const providerCalls: {
    companyId: string;
    tenantId?: string;
    method: string;
  }[] = [];
  try {
    const companies: (Awaited<
      ReturnType<typeof systemDatabase.organisation.create>
    > & {
      connection: Awaited<
        ReturnType<typeof systemDatabase.xeroConnection.create>
      >;
    })[] = [];
    for (const name of ["Company A", "Company B"]) {
      const company = await systemDatabase.organisation.create({
        data: {
          clerk_org_id: clerkOrgId,
          country_code: "AU",
          name,
          timezone: "UTC",
        },
      });
      const grant = await systemDatabase.xeroAuthorisation.create({
        data: {
          access_token_auth_tag: "fixture-tag",
          access_token_encrypted: "fixture-ciphertext",
          access_token_expires_at: new Date(Date.now() + 3_600_000),
          access_token_iv: "fixture-iv",
          granted_scopes: ["payroll.employees"],
          last_refreshed_at: new Date(),
          provider_app_id: randomUUID(),
          refresh_token_auth_tag: "fixture-tag",
          refresh_token_encrypted: "fixture-ciphertext",
          refresh_token_iv: "fixture-iv",
          token_encrypted_at: new Date(),
          token_key_version: 1,
          xero_user_id: randomUUID(),
        },
      });
      grants.push(grant.id);
      const connection = await systemDatabase.xeroConnection.create({
        data: {
          clerk_org_id: clerkOrgId,
          organisation_id: company.id,
          payroll_region: "AU",
          remote_connection_id: randomUUID(),
          xero_authorisation_id: grant.id,
          xero_tenant_id: randomUUID(),
        },
      });
      companies.push({ ...company, connection });
    }
    const [companyA, companyB] = companies;
    if (!(companyA && companyB)) {
      throw new Error("Expected two owned companies");
    }
    const managerUser = `manager-${randomUUID()}`;
    const staffUser = `staff-${randomUUID()}`;
    const manager = await systemDatabase.person.create({
      data: {
        clerk_org_id: clerkOrgId,
        clerk_user_id: managerUser,
        email: "manager@example.test",
        employment_type: "employee",
        first_name: "Manager",
        last_name: "A",
        organisation_id: companyA.id,
        source_system: "MANUAL",
      },
    });
    const employeeId = randomUUID();
    const staff = await systemDatabase.person.create({
      data: {
        clerk_org_id: clerkOrgId,
        clerk_user_id: staffUser,
        email: "staff@example.test",
        employment_type: "employee",
        first_name: "Staff",
        last_name: "B",
        manager_person_id: manager.id,
        organisation_id: companyB.id,
        source_system: "XERO",
        xero_employee_id: employeeId,
      },
    });
    const track = (companyId: string, method: string, tenantId?: string) => {
      assertNoTenantTransaction(`fake provider ${method}`);
      providerCalls.push({ companyId, method, tenantId });
      expect(companyId).toBe(companyB.id);
      if (tenantId) {
        expect(tenantId).toBe(companyB.connection.xero_tenant_id);
      }
    };
    const port: import("@repo/core").ExternalWritePort = {
      approveLeaveApplication: async (input) => {
        track(
          input.organisationId,
          "approve",
          input.mutation?.request.xeroTenantId
        );
        return await { ok: true, value: undefined };
      },
      declineLeaveApplication: async (input) => {
        track(
          input.organisationId,
          "decline",
          input.mutation?.request.xeroTenantId
        );
        return await { ok: true, value: undefined };
      },
      prepareLeaveMutation: async (input) => {
        track(
          input.organisationId,
          "prepare mutation",
          companyB.connection.xero_tenant_id
        );
        return await {
          ok: true,
          value: {
            body: JSON.stringify([
              {
                EmployeeID: input.employeeId,
                LeaveTypeID: input.leaveTypeId,
                Units: input.units,
              },
            ]),
            method: "POST",
            url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
            xeroTenantId: companyB.connection.xero_tenant_id,
          },
        };
      },
      resolveEmployeeId: async (input) => {
        track(input.organisationId, "resolve employee");
        expect(input.personId).toBe(staff.id);
        return await { ok: true, value: employeeId };
      },
      resolveLeaveTypeId: async (input) => {
        track(input.organisationId, "resolve leave type");
        return await { ok: true, value: "annual-leave" };
      },
      submitLeaveApplication: async (input) => {
        track(
          input.organisationId,
          "submit",
          input.mutation?.request.xeroTenantId
        );
        return await {
          ok: true,
          value: {
            rawResponse: { Status: "APPROVED" },
            remoteId: randomUUID(),
          },
        };
      },
      withdrawLeaveApplication: async (input) => {
        track(
          input.organisationId,
          "withdraw",
          input.mutation?.request.xeroTenantId
        );
        return await { ok: true, value: undefined };
      },
    };
    for (const role of ["admin", "manager"] as const) {
      const created = await withTestTenantResult(
        tenantTestAccount({
          actingOrgRole: "org:viewer",
          allDay: true,
          clerkOrgId,
          contactabilityStatus: "contactable",
          createdByUserId: staffUser,
          endsAt: new Date("2050-05-05T23:59:59.999Z"),
          organisationId: companyB.id,
          personId: staff.id,
          privacyMode: "named",
          recordType: "annual_leave",
          startsAt: new Date("2050-05-04T00:00:00Z"),
        }),
        (db) =>
          createRecord(
            {
              actingOrgRole: "org:viewer",
              allDay: true,
              clerkOrgId,
              contactabilityStatus: "contactable",
              createdByUserId: staffUser,
              endsAt: new Date("2050-05-05T23:59:59.999Z"),
              organisationId: companyB.id,
              personId: staff.id,
              privacyMode: "named",
              recordType: "annual_leave",
              startsAt: new Date("2050-05-04T00:00:00Z"),
            },
            db
          )
      );
      expect(created.ok).toBe(true);
      if (!created.ok) {
        throw new Error(created.error.message);
      }
      const recordId = created.value.id;
      const mismatched = await submitDraftRecord(
        {
          actingOrgRole: "org:viewer",
          actingUserId: staffUser,
          clerkOrgId,
          organisationId: companyA.id,
          recordId,
        },
        port
      );
      expect(mismatched.ok).toBe(false);
      expect(
        providerCalls.filter((call) => call.companyId === companyA.id)
      ).toEqual([]);
      const submitted = await submitDraftRecord(
        {
          actingOrgRole: "org:viewer",
          actingUserId: staffUser,
          clerkOrgId,
          organisationId: companyB.id,
          recordId,
        },
        port
      );
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        throw new Error(submitted.error.message);
      }
      const managerNotice = await systemDatabase.notification.findFirst({
        where: {
          clerk_org_id: clerkOrgId,
          object_id: recordId,
          organisation_id: companyB.id,
          recipient_user_id: managerUser,
          type: "leave_submitted",
        },
      });
      expect(managerNotice?.recipient_person_id).toBe(manager.id);
      const managerEmail =
        await systemDatabase.notificationEmailQueue.findFirst({
          where: {
            clerk_org_id: clerkOrgId,
            notification_id: managerNotice?.id,
            recipient_user_id: managerUser,
          },
        });
      expect(managerEmail?.recipient_email).toBe("manager@example.test");
      const approved = await approve(
        {
          actingPersonId: manager.id,
          actingUserId: managerUser,
          clerkOrgId,
          organisationId: companyB.id,
          recordId,
          role,
        },
        port
      );
      expect(approved.ok).toBe(true);
      if (!approved.ok) {
        throw new Error(approved.error.message);
      }
      const operations = await systemDatabase.outboundOperation.findMany({
        where: { availability_record_id: recordId, clerk_org_id: clerkOrgId },
      });
      expect(operations.length).toBeGreaterThan(0);
      for (const operation of operations) {
        expect(operation.organisation_id).toBe(companyB.id);
        expect(operation.request_xero_tenant_id).toBe(
          companyB.connection.xero_tenant_id
        );
      }
    }
    expect(providerCalls.some((call) => call.method === "submit")).toBe(true);
  } finally {
    await systemDatabase.notificationEmailQueue.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.notification.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.auditEvent.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.outboundOperation.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.feedEventPublication.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.availabilityRecord.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.person.updateMany({
      data: { manager_person_id: null },
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.person.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.xeroConnection.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.xeroAuthorisation.deleteMany({
      where: { id: { in: grants } },
    });
    await systemDatabase.accountSettings.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
    await systemDatabase.organisation.deleteMany({
      where: { clerk_org_id: clerkOrgId },
    });
  }
});
