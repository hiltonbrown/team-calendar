import "server-only";

import { appError, type Result } from "@repo/core";
import { systemDatabase } from "@repo/database/system";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { getSession, hasPermission } from "./helpers";

export interface AccountAuthAuditEvent {
  accountId: string;
  actorUserId: string | null;
  after: Record<string, string> | null;
  before: Record<string, string> | null;
  createdAt: string;
  eventType: string;
  id: string;
  requestId: string | null;
  targetUserId: string | null;
}

export interface ListAccountAuthAuditEventsInput {
  cursor?: string;
  limit?: number;
}

interface CursorPayload {
  createdAt: string;
  id: string;
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.createdAt === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id })
  ).toString("base64url");
}

function sanitizeSafeStringRecord(
  value: unknown
): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("password") ||
      lower.includes("session") ||
      lower.includes("credential") ||
      lower.includes("key")
    ) {
      continue;
    }
    if (
      val !== null &&
      val !== undefined &&
      (typeof val === "string" ||
        typeof val === "number" ||
        typeof val === "boolean")
    ) {
      result[key] = String(val);
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export async function listAccountAuthAuditEvents(
  input: ListAccountAuthAuditEventsInput = {}
): Promise<
  Result<{ events: AccountAuthAuditEvent[]; nextCursor: string | null }>
> {
  assertNoTenantTransaction("listAccountAuthAuditEvents");

  const session = await getSession();
  if (!session?.accountId) {
    return {
      error: appError(
        "unauthorised",
        "Not authenticated or no account selected"
      ),
      ok: false,
    };
  }

  const allowed = await hasPermission({ audit: ["read"] });
  if (!allowed) {
    return {
      error: appError("forbidden", "Permission denied"),
      ok: false,
    };
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const { accountId } = session;

  const cursorData = input.cursor ? decodeCursor(input.cursor) : null;
  const cursorDate = cursorData ? new Date(cursorData.createdAt) : null;

  const whereClause: NonNullable<
    Parameters<typeof systemDatabase.authAuditEvent.findMany>[0]
  >["where"] = {
    account_id: accountId,
  };

  if (cursorData && cursorDate && !Number.isNaN(cursorDate.getTime())) {
    whereClause.OR = [
      { created_at: { lt: cursorDate } },
      { created_at: cursorDate, id: { lt: cursorData.id } },
    ];
  }

  const rows = await systemDatabase.authAuditEvent.findMany({
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    where: whereClause,
  });

  const hasMore = rows.length > limit;
  const slicedRows = hasMore ? rows.slice(0, limit) : rows;

  const events: AccountAuthAuditEvent[] = slicedRows.map((row) => ({
    accountId: row.account_id ?? accountId,
    actorUserId: row.actor_user_id,
    after: sanitizeSafeStringRecord(row.after_value),
    before: sanitizeSafeStringRecord(row.before_value),
    createdAt: row.created_at.toISOString(),
    eventType: row.event_type,
    id: row.id,
    requestId: row.request_id,
    targetUserId: row.target_user_id,
  }));

  let nextCursor: string | null = null;
  if (hasMore) {
    const lastRow = slicedRows.at(-1);
    if (lastRow) {
      nextCursor = encodeCursor(lastRow.created_at, lastRow.id);
    }
  }

  return {
    ok: true,
    value: {
      events,
      nextCursor,
    },
  };
}
