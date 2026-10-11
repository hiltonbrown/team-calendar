import "server-only";

import type { Result } from "@repo/core";
import { tenantDatabase } from "@repo/database";
import { z } from "zod";
import { csvEscape, scrubXeroWriteErrorRaw } from "./shared";

export interface AuditEventListItem {
  action: string;
  actorDisplay: string;
  actorUserId: string | null;
  createdAt: Date;
  entityId: string | null;
  entityType: string | null;
  hasBeforeAfter: boolean;
  id: string;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  userAgent: string | null;
}

export interface AuditEventDetail extends AuditEventListItem {
  afterValue: unknown;
  beforeValue: unknown;
}

export type AuditLogServiceError =
  | { code: "event_not_found"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

const BaseSchema = z.object({
  actingRole: z.enum(["admin", "manager", "owner", "viewer"]),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

export const AuditLogFilterSchema = z.object({
  action: z.array(z.string().min(1)).optional(),
  actionPrefix: z.string().min(1).optional(),
  actorUserId: z.array(z.string().min(1)).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  entityType: z.array(z.string().min(1)).optional(),
  searchEntityId: z.string().min(1).optional(),
});

const ListSchema = BaseSchema.extend({
  filters: AuditLogFilterSchema.default({}),
  pagination: z
    .object({
      cursor: z.string().nullable().optional(),
      pageSize: z.number().int().min(1).max(200).default(50),
    })
    .default({ pageSize: 50 }),
});

const DetailSchema = BaseSchema.extend({
  eventId: z.string().uuid(),
});

const ExportSchema = BaseSchema.extend({
  filters: AuditLogFilterSchema.default({}),
});

const EXPORT_LIMIT = 50_000;

export async function listEvents(input: z.input<typeof ListSchema>): Promise<
  Result<
    {
      events: AuditEventListItem[];
      nextCursor: string | null;
      totalCount: number;
    },
    AuditLogServiceError
  >
> {
  const parsed = ListSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canViewAuditLog(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const where = whereFor(parsed.data);
    const [events, totalCount] = await Promise.all([
      tenantDatabase(input.clerkOrgId).auditEvent.findMany({
        cursor: parsed.data.pagination.cursor
          ? { id: parsed.data.pagination.cursor }
          : undefined,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: parsed.data.pagination.cursor ? 1 : 0,
        take: parsed.data.pagination.pageSize + 1,
        where,
      }),
      tenantDatabase(input.clerkOrgId).auditEvent.count({ where }),
    ]);

    const page = events.slice(0, parsed.data.pagination.pageSize).map(mapEvent);
    return {
      ok: true,
      value: {
        events: page,
        nextCursor:
          events.length > parsed.data.pagination.pageSize
            ? (page.at(-1)?.id ?? null)
            : null,
        totalCount,
      },
    };
  } catch {
    return unknownError("Failed to load audit events.");
  }
}

export async function getEventDetail(
  input: z.input<typeof DetailSchema>
): Promise<Result<AuditEventDetail, AuditLogServiceError>> {
  const parsed = DetailSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canViewAuditLog(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const event = await tenantDatabase(input.clerkOrgId).auditEvent.findFirst({
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        id: parsed.data.eventId,
        organisation_id: parsed.data.organisationId,
      },
    });
    if (!event) {
      return {
        error: { code: "event_not_found", message: "Audit event not found." },
        ok: false,
      };
    }

    const mapped = mapEvent(event);
    return {
      ok: true,
      value: {
        ...mapped,
        afterValue: scrubXeroWriteErrorRaw(event.after_value),
        beforeValue: scrubXeroWriteErrorRaw(event.before_value),
      },
    };
  } catch {
    return unknownError("Failed to load audit event detail.");
  }
}

export async function exportCsv(
  input: z.input<typeof ExportSchema>
): Promise<
  Result<{ csvContent: string; filename: string }, AuditLogServiceError>
> {
  const parsed = ExportSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canViewAuditLog(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const events = await tenantDatabase(input.clerkOrgId).auditEvent.findMany({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: EXPORT_LIMIT + 1,
      where: whereFor({
        ...parsed.data,
        pagination: { pageSize: EXPORT_LIMIT },
      }),
    });

    const rows = events
      .slice(0, EXPORT_LIMIT)
      .map((event) => [
        event.created_at.toISOString(),
        event.action,
        event.entity_type ?? event.resource_type,
        event.entity_id ?? event.resource_id ?? "",
        event.actor_display ?? "System",
        event.actor_user_id ?? "",
        event.ip_address ?? "",
        event.user_agent ?? "",
        JSON.stringify(
          scrubXeroWriteErrorRaw(event.metadata ?? event.payload ?? {})
        ),
      ]);

    await tenantDatabase(input.clerkOrgId).auditEvent.create({
      data: {
        action: "audit_log.exported",
        actor_user_id: parsed.data.actingUserId,
        clerk_org_id: parsed.data.clerkOrgId,
        entity_id: parsed.data.organisationId,
        entity_type: "audit_log",
        metadata: {
          filterFingerprint: JSON.stringify(parsed.data.filters),
          rowCount: Math.min(events.length, EXPORT_LIMIT),
        },
        organisation_id: parsed.data.organisationId,
        payload: {
          filterFingerprint: JSON.stringify(parsed.data.filters),
          rowCount: Math.min(events.length, EXPORT_LIMIT),
        },
        resource_id: parsed.data.organisationId,
        resource_type: "audit_log",
      },
    });

    return {
      ok: true,
      value: {
        csvContent: [
          [
            "created_at",
            "action",
            "entity_type",
            "entity_id",
            "actor_display",
            "actor_user_id",
            "ip_address",
            "user_agent",
            "metadata_summary",
          ],
          ...rows,
        ]
          .map((row) => row.map((value) => csvEscape(value)).join(","))
          .join("\r\n")
          .concat("\r\n"),
        filename: `audit-log-${dateStamp(parsed.data.filters.dateFrom)}-${dateStamp(parsed.data.filters.dateTo)}.csv`,
      },
    };
  } catch {
    return unknownError("Failed to export audit log.");
  }
}

function mapEvent(event: {
  action: string;
  actor_display: string | null;
  actor_user_id: string | null;
  after_value: unknown;
  before_value: unknown;
  created_at: Date;
  entity_id: string | null;
  entity_type: string | null;
  id: string;
  ip_address: string | null;
  metadata: unknown;
  payload: unknown;
  resource_id: string | null;
  resource_type: string;
  user_agent: string | null;
}): AuditEventListItem {
  const metadataSource = scrubXeroWriteErrorRaw(
    event.metadata ?? event.payload ?? {}
  );
  return {
    action: event.action,
    actorDisplay: event.actor_display ?? "System",
    actorUserId: event.actor_user_id,
    createdAt: event.created_at,
    entityId: event.entity_id ?? event.resource_id,
    entityType: event.entity_type ?? event.resource_type,
    hasBeforeAfter: Boolean(event.before_value || event.after_value),
    id: event.id,
    ipAddress: event.ip_address,
    metadata:
      metadataSource &&
      typeof metadataSource === "object" &&
      !Array.isArray(metadataSource)
        ? (metadataSource as Record<string, unknown>)
        : {},
    userAgent: event.user_agent,
  };
}

function whereFor(input: z.infer<typeof ListSchema>) {
  return {
    action: input.filters.action?.length
      ? { in: input.filters.action }
      : undefined,
    clerk_org_id: input.clerkOrgId,
    created_at: {
      ...(input.filters.dateFrom ? { gte: input.filters.dateFrom } : {}),
      ...(input.filters.dateTo ? { lte: input.filters.dateTo } : {}),
    },
    entity_id: input.filters.searchEntityId,
    entity_type: input.filters.entityType?.length
      ? { in: input.filters.entityType }
      : undefined,
    organisation_id: input.organisationId,
    ...(input.filters.actionPrefix
      ? { action: { startsWith: input.filters.actionPrefix } }
      : {}),
    ...(input.filters.actorUserId?.length
      ? { actor_user_id: { in: input.filters.actorUserId } }
      : {}),
  };
}

function canViewAuditLog(role: "admin" | "manager" | "owner" | "viewer") {
  return role === "admin" || role === "owner";
}

function dateStamp(value?: Date): string {
  return (value ?? new Date()).toISOString().slice(0, 10);
}

function validationError(
  error: z.ZodError
): Result<never, AuditLogServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid audit log input.",
    },
    ok: false,
  };
}

function notAuthorised(): Result<never, AuditLogServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "Only admins and owners can view the audit log.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, AuditLogServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}
