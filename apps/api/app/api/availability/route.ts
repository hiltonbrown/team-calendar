import { auth, currentUser, requireOrg } from "@repo/auth/helpers";
import { createManualAvailability } from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { listPeopleForOrganisation } from "@repo/database/queries/people";
import { log } from "@repo/observability/log";
import { z } from "zod";

const CreateAvailabilitySchema = z.object({
  allDay: z.boolean().optional().default(true),
  contactability: z.enum(["contactable", "limited", "unavailable"]).optional(),
  endsAt: z.string().datetime(),
  notesInternal: z.string().max(2000).optional().nullable(),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  preferredContactMethod: z.string().max(200).optional().nullable(),
  recordType: z.enum(["leave", "wfh", "travel", "training", "client_site"]),
  startsAt: z.string().datetime(),
  title: z.string().min(1).max(200),
  workingLocation: z.string().max(200).optional().nullable(),
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
    const parseResult = CreateAvailabilitySchema.safeParse(body);

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

    // Safe branded cast: clerkOrgId is verified by Clerk requireOrg(), organisationId is validated by Zod UUID schema
    const scopedClerkOrgId = clerkOrgId as ClerkOrgId;
    const scopedOrgId = data.organisationId as OrganisationId;

    // Validate organisation exists and is in scope
    const orgResult = await getOrganisationById(scopedClerkOrgId, scopedOrgId);

    if (!orgResult.ok) {
      return Response.json(
        { error: orgResult.error, ok: false },
        { status: orgResult.error.code === "not_found" ? 404 : 500 }
      );
    }

    // Validate person exists in organisation
    const peopleResult = await listPeopleForOrganisation(
      scopedClerkOrgId,
      scopedOrgId
    );

    if (!peopleResult.ok) {
      return Response.json(
        { error: peopleResult.error, ok: false },
        { status: 500 }
      );
    }

    const personExists = peopleResult.value.some((p) => p.id === data.personId);

    if (!personExists) {
      return Response.json(
        {
          error: { code: "not_found", message: "Person not found" },
          ok: false,
        },
        { status: 404 }
      );
    }

    const authResult = await auth();

    // Call availability service to create record
    const createResult = await createManualAvailability(
      {
        clerkOrgId: scopedClerkOrgId,
        organisationId: scopedOrgId,
      },
      {
        allDay: data.allDay,
        contactability: data.contactability,
        endsAt: new Date(data.endsAt),
        notesInternal: data.notesInternal,
        personId: data.personId,
        preferredContactMethod: data.preferredContactMethod,
        recordType: data.recordType,
        startsAt: new Date(data.startsAt),
        title: data.title,
        workingLocation: data.workingLocation,
      },
      { orgRole: authResult.orgRole, userId: user.id }
    );

    if (!createResult.ok) {
      return Response.json(
        { error: createResult.error, ok: false },
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
        error: {
          code: "internal",
          message: "Failed to create availability record",
        },
        ok: false,
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

  if (code === "not_authorised") {
    return 403;
  }

  return 500;
}
