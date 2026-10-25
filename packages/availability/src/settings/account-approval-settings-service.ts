import { hasPermission } from "@repo/auth/permissions";
import "server-only";
import type { Result } from "@repo/core";
import {
  assertTenantDb,
  getAccountSettings,
  resolveAccountCompanies,
  type TenantDb,
  updateAccountSettings,
} from "@repo/database";
import { z } from "zod";

const ManagerVisibilitySchema = z.enum([
  "direct_reports_only",
  "all_team_leave",
]);
const ReadSchema = z.object({ accountId: z.string().min(1) });
const WriteSchema = ReadSchema.extend({
  actingRole: z.enum(["admin", "owner", "manager", "viewer"]),
  actingUserId: z.string().min(1),
  managerVisibilityScope: ManagerVisibilitySchema,
});
export interface AccountApprovalSettings {
  accountId: string;
  managerVisibilityScope: z.infer<typeof ManagerVisibilitySchema>;
}
export interface AccountApprovalSettingsError {
  code: "not_authorised" | "validation_error" | "unknown_error";
  message: string;
}
const mapSettings = (
  row: Awaited<ReturnType<typeof getAccountSettings>>
): AccountApprovalSettings => ({
  accountId: row.account_id,
  managerVisibilityScope: ManagerVisibilitySchema.parse(
    row.manager_visibility_scope
  ),
});
export async function getAccountApprovalSettings(
  input: z.input<typeof ReadSchema>,
  db: TenantDb
): Promise<Result<AccountApprovalSettings, AccountApprovalSettingsError>> {
  const parsed = ReadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message: "Invalid account settings request.",
      },
      ok: false,
    };
  }
  assertTenantDb(db, parsed.data.accountId);
  return {
    ok: true,
    value: mapSettings(await getAccountSettings(parsed.data.accountId, db)),
  };
}
export async function updateAccountApprovalSettings(
  input: z.input<typeof WriteSchema>,
  db: TenantDb
): Promise<Result<AccountApprovalSettings, AccountApprovalSettingsError>> {
  const parsed = WriteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message: "Invalid account settings update.",
      },
      ok: false,
    };
  }
  assertTenantDb(db, parsed.data.accountId);
  if (!hasPermission(parsed.data.actingRole, { settings: ["update"] })) {
    return {
      error: {
        code: "not_authorised",
        message: "Only owners and admins can manage account approval settings.",
      },
      ok: false,
    };
  }
  const run = async (
    tenantDb: TenantDb
  ): Promise<Result<AccountApprovalSettings, AccountApprovalSettingsError>> => {
    const [company] = await resolveAccountCompanies(
      parsed.data.accountId,
      tenantDb
    );
    if (!company) {
      return {
        error: {
          code: "validation_error",
          message: "Add a company before configuring leave approvals.",
        },
        ok: false,
      };
    }
    const before = await getAccountSettings(parsed.data.accountId, tenantDb);
    const after = await updateAccountSettings(
      parsed.data.accountId,
      parsed.data.managerVisibilityScope,
      tenantDb
    );
    await tenantDb.auditEvent.create({
      data: {
        account_id: parsed.data.accountId,
        action: "account_settings.updated",
        actor_user_id: parsed.data.actingUserId,
        after_value: { ...mapSettings(after) },
        before_value: { ...mapSettings(before) },
        entity_id: after.id,
        entity_type: "account_settings",
        metadata: { changedKeys: ["managerVisibilityScope"] },
        organisation_id: company.id,
        resource_id: after.id,
        resource_type: "account_settings",
      },
    });
    return { ok: true, value: mapSettings(after) };
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.accountId);
    return await run(db);
  })();
}
