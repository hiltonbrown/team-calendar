import { analytics } from "@repo/analytics/server";
import type {
  DeletedObjectJSON,
  OrganizationJSON,
  OrganizationMembershipJSON,
  UserJSON,
  WebhookEvent,
} from "@repo/auth/server";
import { ensureCurrentUserPerson } from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { database } from "@repo/database";
import { log } from "@repo/observability/log";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { env } from "@/env";

const handleUserCreated = (data: UserJSON) => {
  analytics?.identify({
    distinctId: data.id,
    properties: {
      email: data.email_addresses.at(0)?.email_address,
      firstName: data.first_name,
      lastName: data.last_name,
      createdAt: new Date(data.created_at),
      avatar: data.image_url,
      phoneNumber: data.phone_numbers.at(0)?.phone_number,
    },
  });

  analytics?.capture({
    event: "User Created",
    distinctId: data.id,
  });

  return new Response("User created", { status: 201 });
};

const handleUserUpdated = (data: UserJSON) => {
  analytics?.identify({
    distinctId: data.id,
    properties: {
      email: data.email_addresses.at(0)?.email_address,
      firstName: data.first_name,
      lastName: data.last_name,
      createdAt: new Date(data.created_at),
      avatar: data.image_url,
      phoneNumber: data.phone_numbers.at(0)?.phone_number,
    },
  });

  analytics?.capture({
    event: "User Updated",
    distinctId: data.id,
  });

  return new Response("User updated", { status: 201 });
};

const handleUserDeleted = (data: DeletedObjectJSON) => {
  if (data.id) {
    analytics?.identify({
      distinctId: data.id,
      properties: {
        deleted: new Date(),
      },
    });

    analytics?.capture({
      event: "User Deleted",
      distinctId: data.id,
    });
  }

  return new Response("User deleted", { status: 201 });
};

const handleOrganizationCreated = (data: OrganizationJSON) => {
  analytics?.groupIdentify({
    groupKey: data.id,
    groupType: "company",
    distinctId: data.created_by,
    properties: {
      name: data.name,
      avatar: data.image_url,
    },
  });

  if (data.created_by) {
    analytics?.capture({
      event: "Organisation Created",
      distinctId: data.created_by,
    });
  }

  return new Response("Organisation created", { status: 201 });
};

const handleOrganizationUpdated = (data: OrganizationJSON) => {
  analytics?.groupIdentify({
    groupKey: data.id,
    groupType: "company",
    distinctId: data.created_by,
    properties: {
      name: data.name,
      avatar: data.image_url,
    },
  });

  if (data.created_by) {
    analytics?.capture({
      event: "Organisation Updated",
      distinctId: data.created_by,
    });
  }

  return new Response("Organisation updated", { status: 201 });
};

export const handleOrganizationMembershipCreated = async (
  data: OrganizationMembershipJSON
): Promise<Response> => {
  analytics?.groupIdentify({
    groupKey: data.organization.id,
    groupType: "company",
    distinctId: data.public_user_data.user_id,
  });

  analytics?.capture({
    event: "Organisation Member Created",
    distinctId: data.public_user_data.user_id,
  });

  await ensurePeopleForMembership(data);

  return new Response("Organisation membership created", { status: 201 });
};

export const handleOrganizationMembershipDeleted = async (
  data: OrganizationMembershipJSON
): Promise<Response> => {
  analytics?.capture({
    event: "Organisation Member Deleted",
    distinctId: data.public_user_data.user_id,
  });

  await database.person.updateMany({
    where: {
      clerk_org_id: data.organization.id,
      clerk_user_id: data.public_user_data.user_id,
    },
    data: {
      clerk_user_id: null,
    },
  });

  return new Response("Organisation membership deleted", { status: 201 });
};

async function ensurePeopleForMembership(data: OrganizationMembershipJSON) {
  const organisations = await database.organisation.findMany({
    where: {
      archived_at: null,
      clerk_org_id: data.organization.id,
    },
    select: {
      clerk_org_id: true,
      id: true,
    },
  });

  await Promise.all(
    organisations.map(async (organisation) => {
      const result = await ensureCurrentUserPerson(
        {
          clerkOrgId: organisation.clerk_org_id as ClerkOrgId,
          organisationId: organisation.id as OrganisationId,
        },
        {
          avatarUrl: data.public_user_data.image_url,
          clerkUserId: data.public_user_data.user_id,
          displayName:
            [data.public_user_data.first_name, data.public_user_data.last_name]
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
          error: result.error,
          organisationId: organisation.id,
          userId: data.public_user_data.user_id,
        });
      }
    })
  );
}

export const POST = async (request: Request): Promise<Response> => {
  if (!env.CLERK_WEBHOOK_SECRET) {
    return NextResponse.json({ message: "Not configured", ok: false });
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

  // Get the body
  const payload = (await request.json()) as object;
  const body = JSON.stringify(payload);

  // Create a new SVIX instance with your secret.
  const webhook = new Webhook(env.CLERK_WEBHOOK_SECRET);

  let event: WebhookEvent | undefined;

  // Verify the payload with the headers
  try {
    event = webhook.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (error) {
    log.error("Error verifying webhook:", { error });
    return new Response("Error occured", {
      status: 400,
    });
  }

  // Get the ID and type
  const { id } = event.data;
  const eventType = event.type;

  log.info("Webhook", { id, eventType, body });

  let response: Response = new Response("", { status: 201 });

  switch (eventType) {
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
      response = handleOrganizationCreated(event.data);
      break;
    }
    case "organization.updated": {
      response = handleOrganizationUpdated(event.data);
      break;
    }
    case "organizationMembership.created": {
      response = await handleOrganizationMembershipCreated(event.data);
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

  await analytics?.shutdown();

  return response;
};
