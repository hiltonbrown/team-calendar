import { getCurrentUser, getSession, requireAccount } from "@repo/auth/helpers";
import {
  archiveManualAvailability,
  updateManualAvailability,
} from "@repo/availability";
import type {
  AccountId,
  AvailabilityRecordId,
  OrganisationId,
  Result,
} from "@repo/core";
import { withTenantResult } from "@repo/database";
import { getAvailabilityRecordById } from "@repo/database/queries/availability-records";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
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
  {
    params,
  }: {
    params: Promise<{
      recordId: string;
    }>;
  }
): Promise<Response> {
  assertNoTenantTransaction("PATCH");
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
    // Safe branded cast: accountId is verified by requireAccount(), organisationId and recordId are validated by Zod UUID schemas
    const scopedAccountId = accountId as AccountId;
    const scopedOrgId = organisationId as OrganisationId;
    const scopedRecordId = parsedParams.data.recordId as AvailabilityRecordId;
    const authResult = (await getSession()) ?? {
      accountId: null,
      role: null,
      sessionId: null,
      userId: null,
    };
    const prepared = await withTenantResult(
      scopedAccountId,
      async (db): Promise<Result<HttpDescriptor, HttpDescriptor>> => {
        // Validate organisation exists
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
        // Call availability service to update record
        const updateResult = await (() =>
          updateManualAvailability(
            {
              accountId: scopedAccountId,
              organisationId: scopedOrgId,
            },
            scopedRecordId,
            patch,
            { role: authResult.role, userId: user.id },
            db
          ))();
        if (!updateResult.ok) {
          return httpDescriptor(
            { error: updateResult.error, ok: false },
            {
              status: statusForUpdateError(updateResult.error.code),
            }
          );
        }
        return httpDescriptor({ ok: true, value: updateResult.value });
      }
    );
    const descriptor = prepared.ok ? prepared.value : prepared.error;
    return descriptor.status === 204
      ? new Response(null, { status: 204 })
      : Response.json(descriptor.body, { status: descriptor.status });
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
  {
    params,
  }: {
    params: Promise<{
      recordId: string;
    }>;
  }
): Promise<Response> {
  assertNoTenantTransaction("DELETE");
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
    // Safe branded cast: accountId is verified by requireAccount(), organisationId and recordId are validated by Zod UUID schemas
    const scopedAccountId = accountId as AccountId;
    const scopedOrgId = data.organisationId as OrganisationId;
    const scopedRecordId = parsedParams.data.recordId as AvailabilityRecordId;
    const authResult = (await getSession()) ?? {
      accountId: null,
      role: null,
      sessionId: null,
      userId: null,
    };
    const prepared = await withTenantResult(
      scopedAccountId,
      async (db): Promise<Result<HttpDescriptor, HttpDescriptor>> => {
        // Validate organisation exists
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
        // Get record to verify it exists and is editable
        const recordResult = await getAvailabilityRecordById(
          scopedAccountId,
          scopedOrgId,
          scopedRecordId,
          db
        );
        if (!recordResult.ok) {
          return httpDescriptor(
            { error: recordResult.error, ok: false },
            { status: recordResult.error.code === "not_found" ? 404 : 500 }
          );
        }
        const record = recordResult.value;
        // Check if record is Xero-sourced (read-only)
        if (record.sourceType !== "manual") {
          return httpDescriptor(
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
        const deleteResult = await (() =>
          archiveManualAvailability(
            {
              accountId: scopedAccountId,
              organisationId: scopedOrgId,
            },
            scopedRecordId,
            { role: authResult.role, userId: user.id },
            db
          ))();
        if (!deleteResult.ok) {
          return httpDescriptor(
            { error: deleteResult.error, ok: false },
            {
              status: deleteResult.error.code === "not_authorised" ? 403 : 500,
            }
          );
        }
        return { ok: true, value: { body: null, status: 204 } };
      }
    );
    const descriptor = prepared.ok ? prepared.value : prepared.error;
    return descriptor.status === 204
      ? new Response(null, { status: 204 })
      : Response.json(descriptor.body, { status: descriptor.status });
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
