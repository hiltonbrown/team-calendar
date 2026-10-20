import "server-only";

import type { Result } from "@repo/core";
import {
  afterTenantCommit,
  assertTenantDb,
  type TenantDb,
} from "@repo/database";
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
  organisationId: string;
  organisationName: string;
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

const CategorySchema = z.enum([
  "leave_lifecycle",
  "approval_flow",
  "sync",
  "system",
]);

const ListSchema = z.object({
  clerkOrgId: z.string().min(1),
  filters: z
    .object({
      category: z.array(CategorySchema).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      type: z.array(z.string()).optional(),
      unreadOnly: z.boolean().optional(),
    })
    .optional(),
  pagination: z
    .object({
      cursor: z.string().nullable().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    })
    .optional(),
  userId: z.string().min(1),
});

const ScopedUserSchema = z.object({
  clerkOrgId: z.string().min(1),
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
  db: TenantDb
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
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof listForUser> => {
    const filters = normaliseFilters(parsed.data.filters);
    if (!filters.ok) {
      return filters;
    }
    const pageSize = parsed.data.pagination?.pageSize ?? 25;
    const cursor = decodeCursor(parsed.data.pagination?.cursor ?? null);
    if (parsed.data.pagination?.cursor && !cursor) {
      return {
        error: {
          code: "validation_error",
          message: "Invalid notification cursor.",
        },
        ok: false,
      };
    }

    const where = buildWhere(parsed.data, filters.value, cursor);
    const [rows, unreadCount] = [
      await client.notification.findMany({
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: notificationSelect,
        take: pageSize + 1,
        where,
      }),
      await countUnreadDirect(client, parsed.data),
    ];
    const pageRows = rows.slice(0, pageSize);
    const actors = await loadActorDisplays(
      client,
      parsed.data,
      pageRows.map((row) => row.actor_user_id)
    );

    return {
      ok: true,
      value: {
        nextCursor:
          rows.length > pageSize
            ? encodeCursor(pageRows.at(-1)?.created_at, pageRows.at(-1)?.id)
            : null,
        notifications: pageRows.map((row) => toListItem(row, actors)),
        unreadCount,
      },
    };
  };
  assertTenantDb(db, parsed.data.clerkOrgId);
  return await run(db);
}

export async function markAsRead(
  input: z.input<typeof MarkReadSchema>,
  db: TenantDb
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
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof markAsRead> => {
    const ownedDb = client;

    const existing = await client.notification.findFirst({
      select: notificationSelect,
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        id: parsed.data.notificationId,
        organisation: { clerk_org_id: parsed.data.clerkOrgId },
      },
    });
    if (!existing) {
      return notFound();
    }
    if (existing.recipient_user_id !== parsed.data.userId) {
      return {
        error: {
          code: "not_recipient",
          message: "Only the recipient can mark this notification as read.",
        },
        ok: false,
      };
    }

    const readAt = existing.read_at ?? new Date();
    if (!existing.read_at) {
      await client.notification.updateMany({
        data: { read_at: readAt },
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          id: parsed.data.notificationId,
          organisation: { clerk_org_id: parsed.data.clerkOrgId },
          read_at: null,
          recipient_user_id: parsed.data.userId,
        },
      });
    }

    const unreadCount = await countUnreadDirect(client, parsed.data);
    const item = toListItem({ ...existing, read_at: readAt }, new Map());
    runNotificationEffect(ownedDb, async () => {
      invalidateUnreadCount(parsed.data);
      await publishNotificationEvent(
        {
          clerkOrgId: parsed.data.clerkOrgId,
          userId: parsed.data.userId,
        },
        {
          payload: {
            notificationId: parsed.data.notificationId,
            readAt: readAt.toISOString(),
            unreadCount,
          },
          type: "notification.read",
        }
      );
    });

    return { ok: true, value: { notification: item, unreadCount } };
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

export async function markAllAsRead(
  input: z.input<typeof ScopedUserSchema>,
  db: TenantDb
): Promise<
  Result<{ markedCount: number; unreadCount: 0 }, NotificationServiceError>
> {
  const parsed = ScopedUserSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof markAllAsRead> => {
    const ownedDb = client;

    const result = await client.notification.updateMany({
      data: { read_at: new Date() },
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        organisation: { clerk_org_id: parsed.data.clerkOrgId },
        read_at: null,
        recipient_user_id: parsed.data.userId,
      },
    });
    runNotificationEffect(ownedDb, async () => {
      invalidateUnreadCount(parsed.data);
      await publishNotificationEvent(
        {
          clerkOrgId: parsed.data.clerkOrgId,
          userId: parsed.data.userId,
        },
        { payload: { unreadCount: 0 }, type: "notification.all_read" }
      );
    });
    return {
      ok: true,
      value: { markedCount: result.count, unreadCount: 0 },
    };
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

export async function getUnreadCount(
  input: z.input<typeof ScopedUserSchema>,
  db: TenantDb
): Promise<Result<number, NotificationServiceError>> {
  const parsed = ScopedUserSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof getUnreadCount> => {
    const ownedDb = client;
    const key = cacheKey(parsed.data);
    const cached = unreadCountCache.get(key);
    if (!db && cached && cached.expiresAt > Date.now()) {
      return { ok: true, value: cached.value };
    }

    const value = await countUnreadDirect(client, parsed.data);
    runNotificationEffect(ownedDb, () => {
      unreadCountCache.set(key, { expiresAt: Date.now() + 2000, value });

      return Promise.resolve();
    });
    return { ok: true, value };
  };
  assertTenantDb(db, parsed.data.clerkOrgId);
  return await run(db);
}

export async function listRecentUnread(
  input: z.input<typeof RecentUnreadSchema>,
  db: TenantDb
): Promise<Result<NotificationListItem[], NotificationServiceError>> {
  const parsed = RecentUnreadSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof listRecentUnread> => {
    const limit = parsed.data.limit ?? 3;

    const rows = await client.notification.findMany({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: notificationSelect,
      take: limit,
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        organisation: { clerk_org_id: parsed.data.clerkOrgId },
        read_at: null,
        recipient_user_id: parsed.data.userId,
      },
    });
    const actors = await loadActorDisplays(
      client,
      parsed.data,
      rows.map((row) => row.actor_user_id)
    );
    return { ok: true, value: rows.map((row) => toListItem(row, actors)) };
  };
  assertTenantDb(db, parsed.data.clerkOrgId);
  return await run(db);
}

export function invalidateUnreadCount(input: {
  clerkOrgId: string;
  userId: string;
}): void {
  unreadCountCache.delete(cacheKey(input));
}

async function countUnreadDirect(
  client: TenantDb,
  input: { clerkOrgId: string; userId: string }
): Promise<number> {
  return await client.notification.count({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation: { clerk_org_id: input.clerkOrgId },
      read_at: null,
      recipient_user_id: input.userId,
    },
  });
}

function cacheKey(input: { clerkOrgId: string; userId: string }): string {
  return `${input.clerkOrgId}:${input.userId}`;
}

function normaliseFilters(
  filters: z.infer<typeof ListSchema>["filters"]
): Result<NotificationFilters, NotificationServiceError> {
  const types = filters?.type?.filter(isKnownNotificationType);
  if (filters?.type?.length && types?.length !== filters.type.length) {
    return {
      error: {
        code: "validation_error",
        message: "Invalid notification type.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: {
      category: filters?.category,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
      type: types,
      unreadOnly: filters?.unreadOnly ?? false,
    },
  };
}

function buildWhere(
  input: { clerkOrgId: string; userId: string },
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
    organisation: { clerk_org_id: input.clerkOrgId },
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
  action_url: true,
  actor_user_id: true,
  body: true,
  created_at: true,
  id: true,
  object_id: true,
  object_type: true,
  organisation: { select: { name: true } },
  organisation_id: true,
  read_at: true,
  recipient_user_id: true,
  title: true,
  type: true,
} as const;

interface NotificationRow {
  action_url: string | null;
  actor_user_id: string | null;
  body: string;
  created_at: Date;
  id: string;
  object_id: string | null;
  object_type: string | null;
  organisation: { name: string };
  organisation_id: string;
  read_at: Date | null;
  recipient_user_id: string;
  title: string;
  type: notification_type;
}

async function loadActorDisplays(
  client: TenantDb,
  input: { clerkOrgId: string },
  actorUserIds: Array<string | null>
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(actorUserIds.filter((id): id is string => Boolean(id))),
  ];
  if (unique.length === 0) {
    return new Map();
  }
  const people = await client.person.findMany({
    select: {
      clerk_user_id: true,
      first_name: true,
      last_name: true,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      clerk_user_id: { in: unique },
      organisation: { clerk_org_id: input.clerkOrgId },
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
    actionLabel: config.actionLabel,
    actionUrl: row.action_url,
    actorDisplay: row.actor_user_id
      ? (actors.get(row.actor_user_id) ?? "System")
      : "System",
    body: row.body,
    category: config.userFacingCategory,
    createdAt: row.created_at,
    iconKey: config.iconKey,
    id: row.id,
    isUnread: row.read_at === null,
    label: config.label,
    objectId: row.object_id,
    objectType: row.object_type,
    organisationId: row.organisation_id,
    organisationName: row.organisation.name,
    readAt: row.read_at,
    title: row.title,
    type: row.type,
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
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid notification request.",
    },
    ok: false,
  };
}

function notFound(): Result<never, NotificationServiceError> {
  return {
    error: {
      code: "notification_not_found",
      message: "Notification not found.",
    },
    ok: false,
  };
}

function runNotificationEffect(
  db: TenantDb,
  effect: () => Promise<void>
): void {
  afterTenantCommit(db, effect);
}
