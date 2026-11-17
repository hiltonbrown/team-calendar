import { randomUUID } from "node:crypto";
import type { ExternalWritePort } from "@repo/core";
import { systemDatabase } from "@repo/database";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  assertNoTenantTransaction,
  withTenantResult as withTestTenantResult,
} from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const allocation = allocateLiveTestFixture(
  "packages/availability/src/approvals/multi-company-routing.integration.test.ts"
);
const [accountTenant] = allocation.tenants;
if (!accountTenant || allocation.tenants.length !== 2) {
  throw new Error("Approval routing requires two owned fixture companies");
}

// Tenant request/approval routing is exercised against protected fixture accounts,
// with provider calls replaced by a port that records immutable company identities.
test("B-employed leave and A-employed manager approval use only B's connection and payroll tenant", async () => {
  const { createRecord } = await import("../plans/plan-service");
  const { submitDraftRecord } = await import("../plans/submit-service");
  const { approve } = await import("./approval-service");
  const { accountId } = accountTenant;
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
    for (const [index, name] of ["Company A", "Company B"].entries()) {
      const ownedCompany = allocation.tenants[index];
      if (!ownedCompany) {
        throw new Error("Approval routing fixture company is missing");
      }
      const company = await systemDatabase.organisation.create({
        data: {
          account_id: accountId,
          country_code: "AU",
          id: ownedCompany.organisationId,
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
          id: allocation.globalKey("authorisation", index),
          last_refreshed_at: new Date(),
          provider_app_id: allocation.globalKey("provider_app"),
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
          account_id: accountId,
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
        account_id: accountId,
        email: "manager@example.test",
        employment_type: "employee",
        first_name: "Manager",
        last_name: "A",
        organisation_id: companyA.id,
        source_system: "MANUAL",
        user_id: managerUser,
      },
    });
    const employeeId = randomUUID();
    const staff = await systemDatabase.person.create({
      data: {
        account_id: accountId,
        email: "staff@example.test",
        employment_type: "employee",
        first_name: "Staff",
        last_name: "B",
        manager_person_id: manager.id,
        organisation_id: companyB.id,
        source_system: "XERO",
        user_id: staffUser,
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
    const port: ExternalWritePort = {
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
          accountId,
          actingRole: "viewer",
          allDay: true,
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
              accountId,
              actingRole: "viewer",
              allDay: true,
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
          accountId,
          actingRole: "viewer",
          actingUserId: staffUser,
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
          accountId,
          actingRole: "viewer",
          actingUserId: staffUser,
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
          account_id: accountId,
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
            account_id: accountId,
            notification_id: managerNotice?.id,
            recipient_user_id: managerUser,
          },
        });
      expect(managerEmail?.recipient_email).toBe("manager@example.test");
      const approved = await approve(
        {
          accountId,
          actingPersonId: manager.id,
          actingUserId: managerUser,
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
        where: { account_id: accountId, availability_record_id: recordId },
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
      where: { account_id: accountId },
    });
    await systemDatabase.notification.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.auditEvent.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.outboundOperation.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.feedEventPublication.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.availabilityPublication.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.availabilityRecord.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.person.updateMany({
      data: { manager_person_id: null },
      where: { account_id: accountId },
    });
    await systemDatabase.person.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.xeroConnection.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.xeroAuthorisation.deleteMany({
      where: { id: { in: grants } },
    });
    await systemDatabase.accountSettings.deleteMany({
      where: { account_id: accountId },
    });
    await systemDatabase.organisation.deleteMany({
      where: { account_id: accountId },
    });
  }
});
