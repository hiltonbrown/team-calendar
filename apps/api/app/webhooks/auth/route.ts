import { createHash } from "node:crypto";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { ensureCurrentUserPerson } from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { database } from "@repo/database";
import { log } from "@repo/observability/log";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { env } from "@/env";

// Validates only the Clerk fields the handlers below consume. Unknown keys are
// stripped rather than rejected so future Clerk additions do not break delivery.
const ClerkUserDataSchema = z.object({
  created_at: z.number(),
  email_addresses: z.array(z.object({ email_address: z.string() })).default([]),
  first_name: z.string().nullish(),
  id: z.string(),
  image_url: z.string().nullish(),
  last_name: z.string().nullish(),
  phone_numbers: z.array(z.object({ phone_number: z.string() })).default([]),
});

const ClerkDeletedObjectDataSchema = z.object({
  id: z.string().optional(),
});

const ClerkOrganizationDataSchema = z.object({
  created_by: z.string().nullish(),
  id: z.string(),
  image_url: z.string().nullish(),
  name: z.string(),
});

const ClerkOrganizationMembershipDataSchema = z.object({
  organization: z.object({ id: z.string() }),
  public_user_data: z.object({
    first_name: z.string().nullish(),
    identifier: z.string().nullish(),
    image_url: z.string().nullish(),
    last_name: z.string().nullish(),
    user_id: z.string(),
  }),
  role: z.string().optional(),
});

const ClerkWebhookEnvelopeSchema = z.object({
  data: z.object({ id: z.string().optional() }).passthrough(),
  timestamp: z.number().optional(),
  type: z.string().min(1),
});

// Discriminated over the event types Team Calendar acts on. Any other event type is
// not validated here because the switch below ignores it.
const ClerkWebhookEventSchema = z.discriminatedUnion("type", [
  z.object({ data: ClerkUserDataSchema, type: z.literal("user.created") }),
  z.object({ data: ClerkUserDataSchema, type: z.literal("user.updated") }),
  z.object({
    data: ClerkDeletedObjectDataSchema,
    type: z.literal("user.deleted"),
  }),
  z.object({
    data: ClerkOrganizationDataSchema,
    type: z.literal("organization.created"),
  }),
  z.object({
    data: ClerkOrganizationDataSchema,
    type: z.literal("organization.updated"),
  }),
  z.object({
    data: ClerkOrganizationMembershipDataSchema,
    type: z.literal("organizationMembership.created"),
  }),
  z.object({
    data: ClerkOrganizationMembershipDataSchema,
    type: z.literal("organizationMembership.deleted"),
  }),
]);

const CONSUMED_EVENT_TYPES = new Set<string>([
  "user.created",
  "user.updated",
  "user.deleted",
  "organization.created",
  "organization.updated",
  "organizationMembership.created",
  "organizationMembership.deleted",
]);

type ClerkUserData = z.infer<typeof ClerkUserDataSchema>;
type ClerkDeletedObjectData = z.infer<typeof ClerkDeletedObjectDataSchema>;
type ClerkOrganizationData = z.infer<typeof ClerkOrganizationDataSchema>;
type ClerkOrganizationMembershipData = z.infer<
  typeof ClerkOrganizationMembershipDataSchema
>;

const handleUserCreated = (data: ClerkUserData) => {
  analytics?.identify({
    distinctId: data.id,
    properties: {
      avatar: data.image_url,
      createdAt: new Date(data.created_at),
      email: data.email_addresses.at(0)?.email_address,
      firstName: data.first_name,
      lastName: data.last_name,
      phoneNumber: data.phone_numbers.at(0)?.phone_number,
    },
  });

  analytics?.capture({
    distinctId: data.id,
    event: "User Created",
  });

  return new Response("User created", { status: 201 });
};

const handleUserUpdated = (data: ClerkUserData) => {
  analytics?.identify({
    distinctId: data.id,
    properties: {
      avatar: data.image_url,
      createdAt: new Date(data.created_at),
      email: data.email_addresses.at(0)?.email_address,
      firstName: data.first_name,
      lastName: data.last_name,
      phoneNumber: data.phone_numbers.at(0)?.phone_number,
    },
  });

  analytics?.capture({
    distinctId: data.id,
    event: "User Updated",
  });

  return new Response("User updated", { status: 201 });
};

const handleUserDeleted = (data: ClerkDeletedObjectData) => {
  if (data.id) {
    analytics?.identify({
      distinctId: data.id,
      properties: {
        deleted: new Date(),
      },
    });

    analytics?.capture({
      distinctId: data.id,
      event: "User Deleted",
    });
  }

  return new Response("User deleted", { status: 201 });
};

const handleOrganizationCreated = (
  data: ClerkOrganizationData,
  eventTimestamp: Date
) => {
  analytics?.groupIdentify({
    distinctId: data.created_by ?? undefined,
    groupKey: data.id,
    groupType: "company",
    properties: {
      avatar: data.image_url,
      name: data.name,
    },
  });

  if (data.created_by) {
    analytics?.capture({
      distinctId: data.created_by,
      event: "Organisation Created",
    });
    const activation = createActivationEvent({
      deduplicationKey: data.id,
      name: "Organisation Provisioned",
      occurredAt: eventTimestamp,
      subjectId: data.id,
    });
    analytics?.capture({
      distinctId: activation.distinctId,
      event: activation.event,
      properties: activation.properties,
      timestamp: activation.timestamp,
      uuid: activation.uuid,
    });
  }

  return new Response("Organisation created", { status: 201 });
};

const handleOrganizationUpdated = (data: ClerkOrganizationData) => {
  analytics?.groupIdentify({
    distinctId: data.created_by ?? undefined,
    groupKey: data.id,
    groupType: "company",
    properties: {
      avatar: data.image_url,
      name: data.name,
    },
  });

  if (data.created_by) {
    analytics?.capture({
      distinctId: data.created_by,
      event: "Organisation Updated",
    });
  }

  return new Response("Organisation updated", { status: 201 });
};

export const handleOrganizationMembershipCreated = async (
  data: ClerkOrganizationMembershipData,
  deliveryId: string,
  eventTimestamp: Date
): Promise<Response> => {
  const provisioned = await ensurePeopleForMembership(data);
  if (!provisioned) {
    return new Response("Membership provisioning temporarily unavailable", {
      status: 503,
    });
  }

  analytics?.groupIdentify({
    distinctId: data.public_user_data.user_id,
    groupKey: data.organization.id,
    groupType: "company",
  });

  analytics?.capture({
    distinctId: data.public_user_data.user_id,
    event: "Organisation Member Created",
    timestamp: eventTimestamp,
    uuid: deliveryUuid(deliveryId),
  });
  if (data.role === "org:owner") {
    const activation = createActivationEvent({
      deduplicationKey: deliveryId,
      name: "Customer Admitted",
      occurredAt: eventTimestamp,
      subjectId: data.organization.id,
    });
    analytics?.capture({
      distinctId: activation.distinctId,
      event: activation.event,
      properties: activation.properties,
      timestamp: eventTimestamp,
      uuid: activation.uuid,
    });
  }

  return new Response("Organisation membership created", { status: 201 });
};

export const handleOrganizationMembershipDeleted = async (
  data: ClerkOrganizationMembershipData
): Promise<Response> => {
  analytics?.capture({
    distinctId: data.public_user_data.user_id,
    event: "Organisation Member Deleted",
  });

  await database.person.updateMany({
    data: {
      clerk_user_id: null,
    },
    where: {
      clerk_org_id: data.organization.id,
      clerk_user_id: data.public_user_data.user_id,
    },
  });

  return new Response("Organisation membership deleted", { status: 201 });
};

async function ensurePeopleForMembership(
  data: ClerkOrganizationMembershipData
): Promise<boolean> {
  const organisations = await database.organisation.findMany({
    select: {
      clerk_org_id: true,
      id: true,
    },
    where: {
      archived_at: null,
      clerk_org_id: data.organization.id,
    },
  });

  const outcomes = await Promise.all(
    organisations.map(async (organisation) => {
      try {
        const result = await ensureCurrentUserPerson(
          {
            clerkOrgId: organisation.clerk_org_id as ClerkOrgId,
            organisationId: organisation.id as OrganisationId,
          },
          {
            avatarUrl: data.public_user_data.image_url,
            clerkUserId: data.public_user_data.user_id,
            displayName:
              [
                data.public_user_data.first_name,
                data.public_user_data.last_name,
              ]
                .filter(Boolean)
                .join(" ") ||
              data.public_user_data.identifier ||
              data.public_user_data.user_id,
            email: data.public_user_data.identifier,
            firstName: data.public_user_data.first_name,
            lastName: data.public_user_data.last_name,
          }
        );

        if (!result.ok) {
          log.error("Failed to link Clerk organisation member to person", {
            clerkOrgId: data.organization.id,
            errorCode: result.error.code,
            organisationId: organisation.id,
            userId: data.public_user_data.user_id,
          });
          return false;
        }
        return true;
      } catch (error) {
        log.error("Clerk organisation member provisioning failed", {
          clerkOrgId: data.organization.id,
          error,
          organisationId: organisation.id,
          userId: data.public_user_data.user_id,
        });
        return false;
      }
    })
  );

  return outcomes.every(Boolean);
}

const deliveryUuid = (deliveryId: string): string => {
  const hash = createHash("sha256")
    .update(`clerk-membership:${deliveryId}`)
    .digest("hex")
    .slice(0, 32);
  const variant =
    ["8", "9", "a", "b"][Number.parseInt(hash[16] ?? "0", 16) % 4] ?? "8";
  const uuidHex = `${hash.slice(0, 12)}5${hash.slice(13, 16)}${variant}${hash.slice(17)}`;
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20)}`;
};

export const POST = async (request: Request): Promise<Response> => {
  if (!env.CLERK_WEBHOOK_SECRET) {
    // Fail closed. A 2xx would tell Clerk the delivery succeeded and stop it
    // retrying, silently dropping membership events that link people to Clerk
    // users. A 5xx keeps the event in Clerk's retry queue until the secret is
    // configured.
    log.error("Clerk webhook secret is not configured; rejecting delivery");
    return NextResponse.json(
      { message: "Not configured", ok: false },
      { status: 500 }
    );
  }

  // Get the headers
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!(svixId && svixTimestamp && svixSignature)) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  const body = await request.text();

  // Create a new SVIX instance with your secret.
  const webhook = new Webhook(env.CLERK_WEBHOOK_SECRET);

  // Verify the payload with the headers
  try {
    webhook.verify(body, {
      "svix-id": svixId,
      "svix-signature": svixSignature,
      "svix-timestamp": svixTimestamp,
    });
  } catch (error) {
    log.error("Error verifying webhook:", { error });
    return new Response("Error occured", {
      status: 400,
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    log.error("Invalid Clerk webhook JSON", { error });
    return new Response("Invalid webhook payload", { status: 400 });
  }

  const envelope = ClerkWebhookEnvelopeSchema.safeParse(payload);
  if (!envelope.success) {
    log.error("Invalid Clerk webhook envelope", {
      issues: envelope.error.issues,
    });
    return new Response("Invalid webhook payload", { status: 400 });
  }

  const eventType = envelope.data.type;

  // Validate the payload shape for events we act on before consuming event.data.
  if (!CONSUMED_EVENT_TYPES.has(eventType)) {
    log.info("Webhook received", {
      eventType,
      id: envelope.data.data.id,
    });
    await analytics?.flush();
    return new Response("", { status: 201 });
  }

  const parsed = ClerkWebhookEventSchema.safeParse(payload);
  if (!parsed.success) {
    log.error("Invalid Clerk webhook payload", {
      eventType,
      issues: parsed.error.issues,
    });
    return new Response("Invalid webhook payload", { status: 400 });
  }

  const event = parsed.data;

  // Log identifiers only. The verified payload contains PII (emails, names,
  // phone numbers) and must never reach the log pipeline.
  log.info("Webhook received", { eventType, id: envelope.data.data.id });

  let response: Response = new Response("", { status: 201 });

  switch (event.type) {
    case "user.created": {
      response = handleUserCreated(event.data);
      break;
    }
    case "user.updated": {
      response = handleUserUpdated(event.data);
      break;
    }
    case "user.deleted": {
      response = handleUserDeleted(event.data);
      break;
    }
    case "organization.created": {
      const { timestamp } = envelope.data;
      if (!timestamp || timestamp < Date.UTC(2020, 0, 1)) {
        response = new Response("Webhook timestamp is invalid", {
          status: 503,
        });
        break;
      }
      response = handleOrganizationCreated(event.data, new Date(timestamp));
      break;
    }
    case "organization.updated": {
      response = handleOrganizationUpdated(event.data);
      break;
    }
    case "organizationMembership.created": {
      const { timestamp } = envelope.data;
      if (!timestamp || timestamp < Date.UTC(2020, 0, 1)) {
        response = new Response("Webhook timestamp is invalid", {
          status: 503,
        });
        break;
      }
      response = await handleOrganizationMembershipCreated(
        event.data,
        svixId,
        new Date(timestamp)
      );
      break;
    }
    case "organizationMembership.deleted": {
      response = await handleOrganizationMembershipDeleted(event.data);
      break;
    }
    default: {
      break;
    }
  }

  await analytics?.flush();

  return response;
};
