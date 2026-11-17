import "server-only";
import { createHash } from "node:crypto";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { log } from "@repo/observability/log";
import type { AuthRole } from "./permissions";

interface LifecycleIdentity {
  /** Identity and time of the committed local audit entry, retained on retry. */
  auditId: string;
  occurredAt: Date;
}
interface UserEvent extends LifecycleIdentity {
  kind: "user.created" | "user.updated";
  user: {
    createdAt?: Date;
    email: string;
    image?: string | null;
    name: string;
  };
  userId: string;
}
interface AccountEvent extends LifecycleIdentity {
  account: { image?: string | null; name: string };
  accountId: string;
  createdBy?: string;
  kind: "account.created" | "account.updated";
}
interface MembershipEvent extends LifecycleIdentity {
  accountId: string;
  kind: "membership.created" | "membership.deleted";
  role: AuthRole;
  userId: string;
}
export type AuthLifecycleEvent =
  | UserEvent
  | AccountEvent
  | MembershipEvent
  | (LifecycleIdentity & { kind: "user.deleted"; userId: string });

const eventNames = {
  "account.created": "Organisation Created",
  "account.updated": "Organisation Updated",
  "membership.created": "Organisation Member Created",
  "membership.deleted": "Organisation Member Deleted",
  "user.created": "User Created",
  "user.deleted": "User Deleted",
  "user.updated": "User Updated",
} as const;

const lifecycleUuid = (event: AuthLifecycleEvent): string => {
  const hex = createHash("sha256")
    .update(`team-calendar:auth-lifecycle:${event.kind}:${event.auditId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = (8 + (Number.parseInt(hex[16] ?? "0", 16) % 4)).toString(16);
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
};

/** Best-effort delivery after commit; our local audit remains authoritative. */
export async function emitAuthLifecycleEvent(
  event: AuthLifecycleEvent
): Promise<void> {
  if (!analytics) {
    return;
  }
  try {
    const distinctId = "userId" in event ? event.userId : event.createdBy;
    switch (event.kind) {
      case "user.created":
      case "user.updated":
        analytics.identify({
          distinctId: event.userId,
          properties: {
            avatar: event.user.image,
            createdAt: event.user.createdAt,
            email: event.user.email,
            name: event.user.name,
          },
        });
        break;
      case "user.deleted":
        analytics.identify({
          distinctId: event.userId,
          properties: { deleted: event.occurredAt },
        });
        break;
      case "account.created":
      case "account.updated":
        analytics.groupIdentify({
          distinctId,
          groupKey: event.accountId,
          groupType: "company",
          properties: {
            avatar: event.account.image,
            name: event.account.name,
          },
        });
        break;
      case "membership.created":
        analytics.groupIdentify({
          distinctId: event.userId,
          groupKey: event.accountId,
          groupType: "company",
        });
        break;
      case "membership.deleted":
        break;
      default:
        break;
    }
    if (distinctId) {
      analytics.capture({
        distinctId,
        event: eventNames[event.kind],
        timestamp: event.occurredAt,
        uuid: lifecycleUuid(event),
      });
    }
    if (event.kind === "account.created" && event.createdBy) {
      analytics.capture(
        createActivationEvent({
          deduplicationKey: event.accountId,
          name: "Organisation Provisioned",
          occurredAt: event.occurredAt,
          subjectId: event.accountId,
        })
      );
    }
    if (event.kind === "membership.created" && event.role === "owner") {
      analytics.capture(
        createActivationEvent({
          deduplicationKey: event.auditId,
          name: "Customer Admitted",
          occurredAt: event.occurredAt,
          subjectId: event.accountId,
        })
      );
    }
    await analytics.flush();
  } catch {
    // Do not log profile fields or undo an already committed auth mutation.
    log.error("Auth lifecycle analytics delivery failed", {
      auditId: event.auditId,
      eventKind: event.kind,
    });
  }
}
