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
import { getAvailabilityRecordById } from "@repo/database/queries/availability-records";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { log } from "@repo/observability/log";
import { z } from "zod";

const RouteParamsSchema = z.object({
  recordId: z.string().uuid(),
});

const UpdateAvailabilitySchema = z
  .object({
    organisationId: z.string().uuid(),
  })
  .passthrough();

const DeleteAvailabilitySchema = z.object({
  organisationId: z.string().uuid(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> }
): Promise<Response> {
  try {
    const rawParams = await params;
    const parsedParams = RouteParamsSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      return Response.json(
        {
          error: {
            code: "invalid",
            details: parsedParams.error.issues,
            message: "Invalid route parameters",
          },
          ok: false,
        },
        { status: 400 }
      );
    }

    // Get authenticated user and organisation
    let clerkOrgId: string;
    try {
      clerkOrgId = await requireOrg();
    } catch {
      return Response.json(
        {
          error: { code: "unauthorised", message: "Not authenticated" },
          ok: false,
        },
        { status: 401 }
      );
    }

    // Get current user
    const user = await currentUser();

    if (!user) {
      return Response.json(
        {
          error: { code: "unauthorised", message: "User not found" },
          ok: false,
        },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          error: { code: "invalid", message: "Malformed JSON request body" },
          ok: false,
        },
        { status: 400 }
      );
    }
    const parseResult = UpdateAvailabilitySchema.safeParse(body);

    if (!parseResult.success) {
      return Response.json(
        {
          error: {
            code: "invalid",
            details: parseResult.error.issues,
            message: "Invalid request body",
          },
          ok: false,
        },
        { status: 400 }
      );
    }

    const { organisationId, ...patch } = parseResult.data;

    // Safe branded cast: clerkOrgId is verified by Clerk requireOrg(), organisationId and recordId are validated by Zod UUID schemas
    const scopedClerkOrgId = clerkOrgId as ClerkOrgId;
    const scopedOrgId = organisationId as OrganisationId;
    const scopedRecordId = parsedParams.data.recordId as AvailabilityRecordId;

    // Validate organisation exists
    const orgResult = await getOrganisationById(scopedClerkOrgId, scopedOrgId);

    if (!orgResult.ok) {
      return Response.json(
        { error: orgResult.error, ok: false },
        { status: orgResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    const authResult = await auth();

    // Call availability service to update record
    const updateResult = await updateManualAvailability(
      {
        clerkOrgId: scopedClerkOrgId,
        organisationId: scopedOrgId,
      },
      scopedRecordId,
      patch,
      { orgRole: authResult.orgRole, userId: user.id }
    );

    if (!updateResult.ok) {
      return Response.json(
        { error: updateResult.error, ok: false },
        {
          status: statusForUpdateError(updateResult.error.code),
        }
      );
    }

    return Response.json({ ok: true, value: updateResult.value });
  } catch (error) {
    log.error("Error updating availability record", { error });
    return Response.json(
      {
        error: {
          code: "internal",
          message: "Failed to update availability record",
        },
        ok: false,
      },
      { status: 500 }
    );
  }
}

function statusForUpdateError(code: string): number {
  if (code === "bad_request") {
    return 400;
  }

  if (code === "conflict") {
    return 409;
  }

  if (code === "not_found") {
    return 404;
  }

  if (code === "not_authorised") {
    return 403;
  }

  return 500;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> }
): Promise<Response> {
  try {
    const rawParams = await params;
    const parsedParams = RouteParamsSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      return Response.json(
        {
          error: {
            code: "invalid",
            details: parsedParams.error.issues,
            message: "Invalid route parameters",
          },
          ok: false,
        },
        { status: 400 }
      );
    }

    // Get authenticated user and organisation
    let clerkOrgId: string;
    try {
      clerkOrgId = await requireOrg();
    } catch {
      return Response.json(
        {
          error: { code: "unauthorised", message: "Not authenticated" },
          ok: false,
        },
        { status: 401 }
      );
    }

    // Get current user
    const user = await currentUser();

    if (!user) {
      return Response.json(
        {
          error: { code: "unauthorised", message: "User not found" },
          ok: false,
        },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          error: { code: "invalid", message: "Malformed JSON request body" },
          ok: false,
        },
        { status: 400 }
      );
    }
    const parseResult = DeleteAvailabilitySchema.safeParse(body);

    if (!parseResult.success) {
      return Response.json(
        {
          error: {
            code: "invalid",
            details: parseResult.error.issues,
            message: "Invalid request body",
          },
          ok: false,
        },
        { status: 400 }
      );
    }

    const { data } = parseResult;

    // Safe branded cast: clerkOrgId is verified by Clerk requireOrg(), organisationId and recordId are validated by Zod UUID schemas
    const scopedClerkOrgId = clerkOrgId as ClerkOrgId;
    const scopedOrgId = data.organisationId as OrganisationId;
    const scopedRecordId = parsedParams.data.recordId as AvailabilityRecordId;

    // Validate organisation exists
    const orgResult = await getOrganisationById(scopedClerkOrgId, scopedOrgId);

    if (!orgResult.ok) {
      return Response.json(
        { error: orgResult.error, ok: false },
        { status: orgResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    // Get record to verify it exists and is editable
    const recordResult = await getAvailabilityRecordById(
      scopedClerkOrgId,
      scopedOrgId,
      scopedRecordId
    );

    if (!recordResult.ok) {
      return Response.json(
        { error: recordResult.error, ok: false },
        { status: recordResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    const record = recordResult.value;
    const authResult = await auth();

    // Check if record is Xero-sourced (read-only)
    if (record.sourceType !== "manual") {
      return Response.json(
        {
          error: {
            code: "forbidden",
            message: "Xero-sourced records cannot be deleted",
          },
          ok: false,
        },
        { status: 403 }
      );
    }

    // Call availability service to archive record (soft delete)
    const deleteResult = await archiveManualAvailability(
      {
        clerkOrgId: scopedClerkOrgId,
        organisationId: scopedOrgId,
      },
      scopedRecordId,
      { orgRole: authResult.orgRole, userId: user.id }
    );

    if (!deleteResult.ok) {
      return Response.json(
        { error: deleteResult.error, ok: false },
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
        error: {
          code: "internal",
          message: "Failed to delete availability record",
        },
        ok: false,
      },
      { status: 500 }
    );
  }
}
