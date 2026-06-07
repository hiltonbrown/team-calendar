import { currentUser, requireOrg } from "@repo/auth/helpers";
import { createManualAvailability } from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { getOrganisationById } from "@repo/database/src/queries/organisations";
import { listPeopleForOrganisation } from "@repo/database/src/queries/people";
import { log } from "@repo/observability/log";
import { z } from "zod";

const CreateAvailabilitySchema = z.object({
  personId: z.string().uuid(),
  recordType: z.enum(["leave", "wfh", "travel", "training", "client_site"]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allDay: z.boolean().optional().default(true),
  title: z.string().optional().nullable(),
  notesInternal: z.string().optional().nullable(),
  workingLocation: z.string().optional().nullable(),
  preferredContactMethod: z.string().optional().nullable(),
  contactability: z.enum(["contactable", "limited", "unavailable"]).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
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
    const parseResult = CreateAvailabilitySchema.safeParse(body);

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

    // Validate organisation exists and is in scope
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

    // Validate person exists in organisation
    const peopleResult = await listPeopleForOrganisation(
      clerkOrgId as ClerkOrgId,
      organisationId as OrganisationId
    );

    if (!peopleResult.ok) {
      return Response.json(
        { ok: false, error: peopleResult.error },
        { status: 500 }
      );
    }

    const personExists = peopleResult.value.some((p) => p.id === data.personId);

    if (!personExists) {
      return Response.json(
        {
          ok: false,
          error: { code: "not_found", message: "Person not found" },
        },
        { status: 404 }
      );
    }

    // Call availability service to create record
    const createResult = await createManualAvailability(
      {
        clerkOrgId: clerkOrgId as ClerkOrgId,
        organisationId: organisationId as OrganisationId,
      },
      {
        personId: data.personId,
        recordType: data.recordType,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        title: data.title,
        allDay: data.allDay,
        notesInternal: data.notesInternal,
        workingLocation: data.workingLocation,
        preferredContactMethod: data.preferredContactMethod,
        contactability: data.contactability,
      },
      user.id
    );

    if (!createResult.ok) {
      return Response.json(
        { ok: false, error: createResult.error },
        { status: statusForCreateError(createResult.error.code) }
      );
    }

    return Response.json(
      { ok: true, value: createResult.value },
      { status: 201 }
    );
  } catch (error) {
    log.error("Error creating availability record", { error });
    return Response.json(
      {
        ok: false,
        error: {
          code: "internal",
          message: "Failed to create availability record",
        },
      },
      { status: 500 }
    );
  }
}

function statusForCreateError(code: string): number {
  if (code === "bad_request") {
    return 400;
  }

  if (code === "not_found") {
    return 404;
  }

  if (code === "conflict") {
    return 409;
  }

  return 500;
}
