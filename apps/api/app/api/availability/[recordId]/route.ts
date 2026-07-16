import { auth, currentUser, requireOrg } from "@repo/auth/helpers";
import {
  archiveManualAvailability,
  updateManualAvailability,
} from "@repo/availability";
import type {
  AvailabilityRecordId,
  ClerkOrgId,
  OrganisationId,
} from "@repo/core";
import { getAvailabilityRecordById } from "@repo/database/src/queries/availability-records";
import { getOrganisationById } from "@repo/database/src/queries/organisations";
import { log } from "@repo/observability/log";
import { z } from "zod";

const UpdateAvailabilitySchema = z.object({
  recordType: z
    .enum(["leave", "wfh", "travel", "training", "client_site"])
    .optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  title: z.string().optional().nullable(),
  notesInternal: z.string().optional().nullable(),
  workingLocation: z.string().optional().nullable(),
  preferredContactMethod: z.string().optional().nullable(),
  contactability: z.enum(["contactable", "limited", "unavailable"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> }
): Promise<Response> {
  try {
    const { recordId } = await params;

    // Get authenticated user and organisation
    let clerkOrgId: string;
    try {
      clerkOrgId = await requireOrg();
    } catch {
      return Response.json(
        {
          ok: false,
          error: { code: "unauthorised", message: "Not authenticated" },
        },
        { status: 401 }
      );
    }

    // Get current user
    const user = await currentUser();

    if (!user) {
      return Response.json(
        {
          ok: false,
          error: { code: "unauthorised", message: "User not found" },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const organisationId = body.organisationId as string | undefined;

    if (!organisationId) {
      return Response.json(
        {
          ok: false,
          error: { code: "invalid", message: "organisationId is required" },
        },
        { status: 400 }
      );
    }

    // Validate organisation exists
    const orgResult = await getOrganisationById(
      clerkOrgId as ClerkOrgId,
      organisationId as OrganisationId
    );

    if (!orgResult.ok) {
      return Response.json(
        { ok: false, error: orgResult.error },
        { status: orgResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    // Get record to verify it's editable
    const recordResult = await getAvailabilityRecordById(
      clerkOrgId as ClerkOrgId,
      organisationId as OrganisationId,
      recordId as AvailabilityRecordId
    );

    if (!recordResult.ok) {
      return Response.json(
        { ok: false, error: recordResult.error },
        { status: recordResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    const record = recordResult.value;

    // Check if record is Xero-sourced (read-only)
    if (record.sourceType !== "manual") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "forbidden",
            message: "Xero-sourced records cannot be edited",
          },
        },
        { status: 403 }
      );
    }

    const parseResult = UpdateAvailabilitySchema.safeParse(body);

    if (!parseResult.success) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid",
            message: "Invalid request body",
            details: parseResult.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const data = parseResult.data;
    const authResult = await auth();

    // Call availability service to update record
    const updateResult = await updateManualAvailability(
      {
        clerkOrgId: clerkOrgId as ClerkOrgId,
        organisationId: organisationId as OrganisationId,
      },
      recordId as AvailabilityRecordId,
      {
        recordType: data.recordType,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        title: data.title,
        allDay: data.allDay,
        notesInternal: data.notesInternal,
        workingLocation: data.workingLocation,
        preferredContactMethod: data.preferredContactMethod,
        contactability: data.contactability,
      },
      { orgRole: authResult.orgRole, userId: user.id }
    );

    if (!updateResult.ok) {
      return Response.json(
        { ok: false, error: updateResult.error },
        {
          status: updateResult.error.code === "not_authorised" ? 403 : 500,
        }
      );
    }

    return Response.json({ ok: true, value: updateResult.value });
  } catch (error) {
    log.error("Error updating availability record", { error });
    return Response.json(
      {
        ok: false,
        error: {
          code: "internal",
          message: "Failed to update availability record",
        },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> }
): Promise<Response> {
  try {
    const { recordId } = await params;

    // Get authenticated user and organisation
    let clerkOrgId: string;
    try {
      clerkOrgId = await requireOrg();
    } catch {
      return Response.json(
        {
          ok: false,
          error: { code: "unauthorised", message: "Not authenticated" },
        },
        { status: 401 }
      );
    }

    // Get current user
    const user = await currentUser();

    if (!user) {
      return Response.json(
        {
          ok: false,
          error: { code: "unauthorised", message: "User not found" },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const organisationId = body.organisationId as string | undefined;

    if (!organisationId) {
      return Response.json(
        {
          ok: false,
          error: { code: "invalid", message: "organisationId is required" },
        },
        { status: 400 }
      );
    }

    // Validate organisation exists
    const orgResult = await getOrganisationById(
      clerkOrgId as ClerkOrgId,
      organisationId as OrganisationId
    );

    if (!orgResult.ok) {
      return Response.json(
        { ok: false, error: orgResult.error },
        { status: orgResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    // Get record to verify it exists and is editable
    const recordResult = await getAvailabilityRecordById(
      clerkOrgId as ClerkOrgId,
      organisationId as OrganisationId,
      recordId as AvailabilityRecordId
    );

    if (!recordResult.ok) {
      return Response.json(
        { ok: false, error: recordResult.error },
        { status: recordResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    const record = recordResult.value;
    const authResult = await auth();

    // Check if record is Xero-sourced (read-only)
    if (record.sourceType !== "manual") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "forbidden",
            message: "Xero-sourced records cannot be deleted",
          },
        },
        { status: 403 }
      );
    }

    // Call availability service to archive record (soft delete)
    const deleteResult = await archiveManualAvailability(
      {
        clerkOrgId: clerkOrgId as ClerkOrgId,
        organisationId: organisationId as OrganisationId,
      },
      recordId as AvailabilityRecordId,
      { orgRole: authResult.orgRole, userId: user.id }
    );

    if (!deleteResult.ok) {
      return Response.json(
        { ok: false, error: deleteResult.error },
        {
          status: deleteResult.error.code === "not_authorised" ? 403 : 500,
        }
      );
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    log.error("Error deleting availability record", { error });
    return Response.json(
      {
        ok: false,
        error: {
          code: "internal",
          message: "Failed to delete availability record",
        },
      },
      { status: 500 }
    );
  }
}
