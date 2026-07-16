import "server-only";

import type { Result } from "@repo/core";
import { type Database, database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type { notification_type } from "@repo/database/generated/enums";
import { z } from "zod";
import { publishNotificationEvent } from "./sse/broker";
import {
  getTypeConfig,
  isKnownNotificationType,
  listAllTypes,
  type NotificationCategory,
} from "./types/notification-type-registry";

export type NotificationServiceError =
  | { code: "cross_org_leak"; message: string }
  | { code: "not_recipient"; message: string }
  | { code: "notification_not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface NotificationListItem {
  actionLabel: string;
  actionUrl: string | null;
  actorDisplay: string;
  body: string;
  category: NotificationCategory;
  createdAt: Date;
  iconKey: string;
  id: string;
  isUnread: boolean;
  label: string;
  objectId: string | null;
  objectType: string | null;
  readAt: Date | null;
  title: string;
  type: notification_type;
}

export interface NotificationFilters {
  category?: NotificationCategory[];
  dateFrom?: Date;
  dateTo?: Date;
  type?: notification_type[];
  unreadOnly?: boolean;
}

export interface NotificationPagination {
  cursor?: string | null;
  pageSize?: number;
}

export interface NotificationServiceDatabase {
  notification: Pick<
    Database["notification"],
    "count" | "findFirst" | "findMany" | "updateMany"
  >;
  person: Pick<Database["person"], "findMany">;
}

const CategorySchema = z.enum([
  "leave_lifecycle",
  "approval_flow",
  "sync",
  "system",
]);

const ListSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  userId: z.string().min(1),
  filters: z
    .object({
      unreadOnly: z.boolean().optional(),
      type: z.array(z.string()).optional(),
      category: z.array(CategorySchema).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    })
    .optional(),
  pagination: z
    .object({
      cursor: z.string().nullable().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    })
    .optional(),
});

const ScopedUserSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  userId: z.string().min(1),
});

const MarkReadSchema = ScopedUserSchema.extend({
  notificationId: z.string().uuid(),
});

const RecentUnreadSchema = ScopedUserSchema.extend({
  limit: z.number().int().positive().max(5).optional(),
});

const unreadCountCache = new Map<
  string,
  { expiresAt: number; value: number }
>();

export async function listForUser(
  input: z.input<typeof ListSchema>,
  client: NotificationServiceDatabase = database
): Promise<
  Result<
    {
      notifications: NotificationListItem[];
      nextCursor: string | null;
      unreadCount: number;
    },
    NotificationServiceError
  >
> {
  const parsed = ListSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const filters = normaliseFilters(parsed.data.filters);
  if (!filters.ok) {
    return filters;
  }
  const pageSize = parsed.data.pagination?.pageSize ?? 25;
  const cursor = decodeCursor(parsed.data.pagination?.cursor ?? null);
  if (parsed.data.pagination?.cursor && !cursor) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Invalid notification cursor.",
      },
    };
  }

  try {
    const where = buildWhere(parsed.data, filters.value, cursor);
    const [rows, unreadCount] = await Promise.all([
      client.notification.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        select: notificationSelect,
      }),
      client.notification.count({
        where: {
          ...buildWhere(parsed.data, { ...filters.value, unreadOnly: false }),
          read_at: null,
        },
      }),
    ]);
    const pageRows = rows.slice(0, pageSize);
    const actors = await loadActorDisplays(
      client,
      parsed.data,
      pageRows.map((row) => row.actor_user_id)
    );

    return {
      ok: true,
      value: {
        notifications: pageRows.map((row) => toListItem(row, actors)),
        nextCursor:
          rows.length > pageSize
            ? encodeCursor(pageRows.at(-1)?.created_at, pageRows.at(-1)?.id)
            : null,
        unreadCount,
      },
    };
  } catch {
    return unknownError("Failed to load notifications.");
  }
}

export async function markAsRead(
  input: z.input<typeof MarkReadSchema>,
  client: NotificationServiceDatabase = database
): Promise<
  Result<
    { notification: NotificationListItem; unreadCount: number },
    NotificationServiceError
  >
> {
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const existing = await client.notification.findFirst({
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        id: parsed.data.notificationId,
        organisation_id: parsed.data.organisationId,
      },
      select: notificationSelect,
    });
    if (!existing) {
      return notFound();
    }
    if (existing.recipient_user_id !== parsed.data.userId) {
      return {
        ok: false,
        error: {
          code: "not_recipient",
          message: "Only the recipient can mark this notification as read.",
        },
      };
    }

    const readAt = existing.read_at ?? new Date();
    if (!existing.read_at) {
      await client.notification.updateMany({
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          id: parsed.data.notificationId,
          organisation_id: parsed.data.organisationId,
          read_at: null,
          recipient_user_id: parsed.data.userId,
        },
        data: { read_at: readAt },
      });
      invalidateUnreadCount(parsed.data);
    }

    const unreadCount = await countUnreadDirect(client, parsed.data);
    const item = toListItem({ ...existing, read_at: readAt }, new Map());
    publishNotificationEvent(
      {
        organisationId: parsed.data.organisationId,
        userId: parsed.data.userId,
      },
      {
        type: "notification.read",
        payload: {
          notificationId: parsed.data.notificationId,
          readAt: readAt.toISOString(),
          unreadCount,
        },
      }
    ).catch(() => undefined);

    return { ok: true, value: { notification: item, unreadCount } };
  } catch {
    return unknownError("Failed to mark notification as read.");
  }
}

export async function markAllAsRead(
  input: z.input<typeof ScopedUserSchema>,
  client: NotificationServiceDatabase = database
): Promise<
  Result<{ markedCount: number; unreadCount: 0 }, NotificationServiceError>
> {
  const parsed = ScopedUserSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const result = await client.notification.updateMany({
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        organisation_id: parsed.data.organisationId,
        read_at: null,
        recipient_user_id: parsed.data.userId,
      },
      data: { read_at: new Date() },
    });
    invalidateUnreadCount(parsed.data);
    publishNotificationEvent(
      {
        organisationId: parsed.data.organisationId,
        userId: parsed.data.userId,
      },
      { type: "notification.all_read", payload: { unreadCount: 0 } }
    ).catch(() => undefined);
    return { ok: true, value: { markedCount: result.count, unreadCount: 0 } };
  } catch {
    return unknownError("Failed to mark notifications as read.");
  }
}

export async function getUnreadCount(
  input: z.input<typeof ScopedUserSchema>,
  client: NotificationServiceDatabase = database
): Promise<Result<number, NotificationServiceError>> {
  const parsed = ScopedUserSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const key = cacheKey(parsed.data);
  const cached = unreadCountCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, value: cached.value };
  }

  try {
    const value = await countUnreadDirect(client, parsed.data);
    unreadCountCache.set(key, { value, expiresAt: Date.now() + 2000 });
    return { ok: true, value };
  } catch {
    return unknownError("Failed to count unread notifications.");
  }
}

export async function listRecentUnread(
  input: z.input<typeof RecentUnreadSchema>,
  client: NotificationServiceDatabase = database
): Promise<Result<NotificationListItem[], NotificationServiceError>> {
  const parsed = RecentUnreadSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const limit = parsed.data.limit ?? 3;

  try {
    const rows = await client.notification.findMany({
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        organisation_id: parsed.data.organisationId,
        read_at: null,
        recipient_user_id: parsed.data.userId,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit,
      select: notificationSelect,
    });
    const actors = await loadActorDisplays(
      client,
      parsed.data,
      rows.map((row) => row.actor_user_id)
    );
    return { ok: true, value: rows.map((row) => toListItem(row, actors)) };
  } catch {
    return unknownError("Failed to load recent unread notifications.");
  }
}

export function invalidateUnreadCount(input: {
  clerkOrgId: string;
  organisationId: string;
  userId: string;
}): void {
  unreadCountCache.delete(cacheKey(input));
}

async function countUnreadDirect(
  client: NotificationServiceDatabase,
  input: { clerkOrgId: string; organisationId: string; userId: string }
): Promise<number> {
  return await client.notification.count({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      read_at: null,
      recipient_user_id: input.userId,
    },
  });
}

function cacheKey(input: {
  clerkOrgId: string;
  organisationId: string;
  userId: string;
}): string {
  return `${input.clerkOrgId}:${input.organisationId}:${input.userId}`;
}

function normaliseFilters(
  filters: z.infer<typeof ListSchema>["filters"]
): Result<NotificationFilters, NotificationServiceError> {
  const types = filters?.type?.filter(isKnownNotificationType);
  if (filters?.type?.length && types?.length !== filters.type.length) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Invalid notification type.",
      },
    };
  }
  return {
    ok: true,
    value: {
      unreadOnly: filters?.unreadOnly ?? false,
      type: types,
      category: filters?.category,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
    },
  };
}

function buildWhere(
  input: { clerkOrgId: string; organisationId: string; userId: string },
  filters: NotificationFilters,
  cursor?: DecodedCursor | null
): Prisma.NotificationWhereInput {
  const categoryTypes = filters.category?.length
    ? listAllTypes()
        .filter((config) =>
          filters.category?.includes(config.userFacingCategory)
        )
        .map((config) => config.type)
    : undefined;
  const requestedTypes = filters.type?.length ? filters.type : undefined;
  const typeFilter =
    requestedTypes && categoryTypes
      ? requestedTypes.filter((type) => categoryTypes.includes(type))
      : (requestedTypes ?? categoryTypes);
  const hasTypeConstraint = Boolean(requestedTypes || categoryTypes);

  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    recipient_user_id: input.userId,
    ...(filters.unreadOnly ? { read_at: null } : {}),
    ...(hasTypeConstraint ? { type: { in: typeFilter ?? [] } } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          created_at: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
    ...(cursor
      ? {
          OR: [
            { created_at: { lt: cursor.createdAt } },
            { created_at: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };
}

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  action_url: true,
  object_type: true,
  object_id: true,
  actor_user_id: true,
  recipient_user_id: true,
  created_at: true,
  read_at: true,
} as const;

interface NotificationRow {
  action_url: string | null;
  actor_user_id: string | null;
  body: string;
  created_at: Date;
  id: string;
  object_id: string | null;
  object_type: string | null;
  read_at: Date | null;
  recipient_user_id: string;
  title: string;
  type: notification_type;
}

async function loadActorDisplays(
  client: NotificationServiceDatabase,
  input: { clerkOrgId: string; organisationId: string },
  actorUserIds: Array<string | null>
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(actorUserIds.filter((id): id is string => Boolean(id))),
  ];
  if (unique.length === 0) {
    return new Map();
  }
  const people = await client.person.findMany({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      clerk_user_id: { in: unique },
    },
    select: {
      clerk_user_id: true,
      first_name: true,
      last_name: true,
    },
  });
  return new Map(
    people
      .filter((person) => person.clerk_user_id)
      .map((person) => [
        person.clerk_user_id ?? "",
        `${person.first_name} ${person.last_name.charAt(0)}.`,
      ])
  );
}

function toListItem(
  row: NotificationRow,
  actors: Map<string, string>
): NotificationListItem {
  const config = getTypeConfig(row.type);
  return {
    id: row.id,
    type: row.type,
    category: config.userFacingCategory,
    label: config.label,
    iconKey: config.iconKey,
    title: row.title,
    body: row.body,
    actionUrl: row.action_url,
    actionLabel: config.actionLabel,
    objectType: row.object_type,
    objectId: row.object_id,
    actorDisplay: row.actor_user_id
      ? (actors.get(row.actor_user_id) ?? "System")
      : "System",
    createdAt: row.created_at,
    readAt: row.read_at,
    isUnread: row.read_at === null,
  };
}

interface DecodedCursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(createdAt?: Date, id?: string): string | null {
  if (!(createdAt && id)) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

function decodeCursor(cursor: string | null): DecodedCursor | null {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = z
      .object({ createdAt: z.coerce.date(), id: z.string().uuid() })
      .safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function validationError(
  error: z.ZodError
): Result<never, NotificationServiceError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid notification request.",
    },
  };
}

function notFound(): Result<never, NotificationServiceError> {
  return {
    ok: false,
    error: {
      code: "notification_not_found",
      message: "Notification not found.",
    },
  };
}

function unknownError(
  message: string
): Result<never, NotificationServiceError> {
  return { ok: false, error: { code: "unknown_error", message } };
}
