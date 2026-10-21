"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  archiveManualAvailability,
  createManualAvailability,
  updateManualAvailability,
} from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { afterTenantCommit, withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ManualAvailabilityActionSchema = z.object({
  allDay: z.boolean().default(true),
  contactability: z.enum(["contactable", "limited", "unavailable"]),
  endsAt: z.string().min(1),
  includeInFeed: z.boolean().default(true),
  notesInternal: z.string().optional(),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  preferredContactMethod: z.string().optional(),
  privacyMode: z.enum(["named", "masked", "private"]),
  recordType: z.enum(["leave", "wfh", "travel", "training", "client_site"]),
  startsAt: z.string().min(1),
  title: z.string().min(1).max(200),
  workingLocation: z.string().optional(),
});

const RecordActionSchema = z.object({
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

export type ManualAvailabilityActionInput = z.infer<
  typeof ManualAvailabilityActionSchema
>;

export type AvailabilityActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export async function createManualAvailabilityAction(
  input: ManualAvailabilityActionInput
): Promise<AvailabilityActionResult> {
  assertNoTenantTransaction("createManualAvailabilityAction");
  const parsed = ManualAvailabilityActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid availability record",
      ok: false,
    };
  }

  const [authResult, user] = await Promise.all([auth(), currentUser()]);
  if (!(authResult.orgId && user)) {
    return { error: "Not authenticated", ok: false };
  }
  const clerkOrgId = authResult.orgId as ClerkOrgId;
  try {
    const prepared = await withTenantResult(
      clerkOrgId,
      async (db): Promise<Result<{ id?: string }, string>> => {
        const company = await getOrganisationById(
          clerkOrgId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await createManualAvailability(
          { clerkOrgId, organisationId: company.value.id as OrganisationId },
          toServiceInput(parsed.data),
          { orgRole: authResult.orgRole, userId: user.id },
          db
        );

        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }

        afterTenantCommit(db, () => {
          revalidateAvailabilityPaths();

          return Promise.resolve();
        });
        return { ok: true, value: { id: result.value.id } };
      }
    );
    return prepared.ok
      ? { ok: true, ...prepared.value }
      : { error: prepared.error, ok: false };
  } catch {
    return { error: "Failed to save availability record.", ok: false };
  }
}

export async function updateManualAvailabilityAction(
  recordId: string,
  input: ManualAvailabilityActionInput
): Promise<AvailabilityActionResult> {
  assertNoTenantTransaction("updateManualAvailabilityAction");
  const recordParsed = z.string().uuid().safeParse(recordId);
  if (!recordParsed.success) {
    return { error: "Invalid availability record", ok: false };
  }

  const parsed = ManualAvailabilityActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid availability record",
      ok: false,
    };
  }

  const [authResult, user] = await Promise.all([auth(), currentUser()]);
  if (!(authResult.orgId && user)) {
    return { error: "Not authenticated", ok: false };
  }
  const clerkOrgId = authResult.orgId as ClerkOrgId;
  try {
    const prepared = await withTenantResult(
      clerkOrgId,
      async (db): Promise<Result<{ id?: string }, string>> => {
        const company = await getOrganisationById(
          clerkOrgId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await updateManualAvailability(
          { clerkOrgId, organisationId: company.value.id as OrganisationId },
          recordParsed.data,
          toServiceInput(parsed.data),
          { orgRole: authResult.orgRole, userId: user.id },
          db
        );

        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }

        afterTenantCommit(db, () => {
          revalidateAvailabilityPaths();

          return Promise.resolve();
        });
        return { ok: true, value: { id: result.value.id } };
      }
    );
    return prepared.ok
      ? { ok: true, ...prepared.value }
      : { error: prepared.error, ok: false };
  } catch {
    return { error: "Failed to save availability record.", ok: false };
  }
}

export async function archiveManualAvailabilityAction(
  input: z.infer<typeof RecordActionSchema>
): Promise<AvailabilityActionResult> {
  assertNoTenantTransaction("archiveManualAvailabilityAction");
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid availability record", ok: false };
  }

  const [authResult, user] = await Promise.all([auth(), currentUser()]);
  if (!(authResult.orgId && user)) {
    return { error: "Not authenticated", ok: false };
  }
  const clerkOrgId = authResult.orgId as ClerkOrgId;
  try {
    const prepared = await withTenantResult(
      clerkOrgId,
      async (db): Promise<Result<{ id?: string }, string>> => {
        const company = await getOrganisationById(
          clerkOrgId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return { error: company.error.message, ok: false };
        }
        const result = await archiveManualAvailability(
          { clerkOrgId, organisationId: company.value.id as OrganisationId },
          parsed.data.recordId,
          { orgRole: authResult.orgRole, userId: user.id },
          db
        );

        if (!result.ok) {
          return { error: result.error.message, ok: false };
        }

        afterTenantCommit(db, () => {
          revalidateAvailabilityPaths();

          return Promise.resolve();
        });
        return { ok: true, value: {} };
      }
    );
    return prepared.ok
      ? { ok: true, ...prepared.value }
      : { error: prepared.error, ok: false };
  } catch {
    return { error: "Failed to save availability record.", ok: false };
  }
}

function toServiceInput(input: ManualAvailabilityActionInput) {
  return {
    ...input,
    endsAt: new Date(input.endsAt),
    notesInternal: emptyToUndefined(input.notesInternal),
    preferredContactMethod: emptyToUndefined(input.preferredContactMethod),
    startsAt: new Date(input.startsAt),
    workingLocation: emptyToUndefined(input.workingLocation),
  };
}

function emptyToUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function revalidateAvailabilityPaths(): void {
  for (const path of ["/", "/plans", "/availability", "/calendar", "/people"]) {
    revalidatePath(path);
  }
}
