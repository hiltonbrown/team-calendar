import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { assertTenantDb, type TenantDb } from "../tenant-db";
import { scopedQuery } from "../tenant-query";

export interface OrganisationSettingsRow {
  clerk_org_id: string;
  created_at: Date;
  default_feed_privacy_mode: "masked" | "named" | "private";
  default_leave_request_advance_days: number;
  default_privacy_mode: "masked" | "named" | "private";
  feeds_include_public_holidays_default: boolean;
  id: string;
  notify_managers_on_status_change: boolean;
  organisation_id: string;
  require_decline_reason: boolean;
  show_declined_on_approvals: boolean;
  show_pending_on_calendar: boolean;
  updated_at: Date;
}

export interface OrganisationSettingsUpdateInput {
  default_feed_privacy_mode?: "masked" | "named" | "private";
  default_leave_request_advance_days?: number;
  default_privacy_mode?: "masked" | "named" | "private";
  feeds_include_public_holidays_default?: boolean;
  notify_managers_on_status_change?: boolean;
  require_decline_reason?: boolean;
  show_declined_on_approvals?: boolean;
  show_pending_on_calendar?: boolean;
}

const organisationSettingsSelect = {
  clerk_org_id: true,
  created_at: true,
  default_feed_privacy_mode: true,
  default_leave_request_advance_days: true,
  default_privacy_mode: true,
  feeds_include_public_holidays_default: true,
  id: true,
  notify_managers_on_status_change: true,
  organisation_id: true,
  require_decline_reason: true,
  show_declined_on_approvals: true,
  show_pending_on_calendar: true,
  updated_at: true,
} as const;

export async function getOrCreateForOrganisation(
  input: {
    clerkOrgId: ClerkOrgId;
    organisationId: OrganisationId;
  },
  db: TenantDb
): Promise<OrganisationSettingsRow> {
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const existing = await client.organisationSettings.findFirst({
      select: organisationSettingsSelect,
      where: scopedQuery(input.clerkOrgId, input.organisationId),
    });
    if (existing) {
      return existing;
    }

    // ON CONFLICT DO NOTHING keeps PostgreSQL's interactive transaction usable
    // when another request wins the organisation's unique settings row.
    await client.organisationSettings.createMany({
      data: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
      skipDuplicates: true,
    });
    return await client.organisationSettings.findFirstOrThrow({
      select: organisationSettingsSelect,
      where: scopedQuery(input.clerkOrgId, input.organisationId),
    });
  }
}

export async function updateForOrganisation(
  input: {
    clerkOrgId: ClerkOrgId;
    organisationId: OrganisationId;
    patch: OrganisationSettingsUpdateInput;
  },
  db: TenantDb
): Promise<OrganisationSettingsRow> {
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    await getOrCreateForOrganisation(input, client);

    await client.organisationSettings.updateMany({
      data: input.patch,
      where: scopedQuery(input.clerkOrgId, input.organisationId),
    });

    return await client.organisationSettings.findFirstOrThrow({
      select: organisationSettingsSelect,
      where: scopedQuery(input.clerkOrgId, input.organisationId),
    });
  }
}
