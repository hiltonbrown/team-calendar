import { getCurrentUser, getSession, requireAccount } from "@repo/auth/helpers";
import { createManualAvailability } from "@repo/availability";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import { withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { listPeopleForOrganisation } from "@repo/database/queries/people";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
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
  assertNoTenantTransaction("POST");
  try {
    // Get authenticated user and organisation
    let accountId: string;
    try {
      accountId = await requireAccount();
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
    const user = await getCurrentUser();
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
    // Safe branded cast: accountId is verified by Clerk requireAccount(), organisationId is validated by Zod UUID schema
    const scopedAccountId = accountId as AccountId;
    const scopedOrgId = data.organisationId as OrganisationId;
    const authResult = (await getSession()) ?? {
      accountId: null,
      role: null,
      sessionId: null,
      userId: null,
    };
    const prepared = await withTenantResult(
      scopedAccountId,
      async (db): Promise<Result<HttpDescriptor, HttpDescriptor>> => {
        // Validate organisation exists and is in scope
        const orgResult = await getOrganisationById(
          scopedAccountId,
          scopedOrgId,
          db
        );
        if (!orgResult.ok) {
          return httpDescriptor(
            { error: orgResult.error, ok: false },
            { status: orgResult.error.code === "not_found" ? 404 : 500 }
          );
        }
        // Validate person exists in organisation
        const peopleResult = await listPeopleForOrganisation(
          scopedAccountId,
          scopedOrgId,
          undefined,
          db
        );
        if (!peopleResult.ok) {
          return httpDescriptor(
            { error: peopleResult.error, ok: false },
            { status: 500 }
          );
        }
        const personExists = peopleResult.value.some(
          (p) => p.id === data.personId
        );
        if (!personExists) {
          return httpDescriptor(
            {
              error: { code: "not_found", message: "Person not found" },
              ok: false,
            },
            { status: 404 }
          );
        }
        // Call availability service to create record
        const createResult = await (() =>
          createManualAvailability(
            {
              accountId: scopedAccountId,
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
            { role: authResult.role, userId: user.id },
            db
          ))();
        if (!createResult.ok) {
          return httpDescriptor(
            { error: createResult.error, ok: false },
            { status: statusForCreateError(createResult.error.code) }
          );
        }
        return httpDescriptor(
          { ok: true, value: createResult.value },
          { status: 201 }
        );
      }
    );
    const descriptor = prepared.ok ? prepared.value : prepared.error;
    return Response.json(descriptor.body, { status: descriptor.status });
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

interface HttpDescriptor {
  body: unknown;
  status: number;
}
function httpDescriptor(
  body: unknown,
  init?: { status: number }
): Result<HttpDescriptor, HttpDescriptor> {
  const descriptor = { body, status: init?.status ?? 200 };
  return descriptor.status >= 400
    ? { error: descriptor, ok: false }
    : { ok: true, value: descriptor };
}
