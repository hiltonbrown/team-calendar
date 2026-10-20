"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  ensureCurrentUserPerson,
  ensureOrganisationForClerk,
  type OrganisationSettingsInput,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { withTenantResult } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { redirect } from "next/navigation";
import { z } from "zod";

const SetupOrganisationSchema = z
  .object({
    countryCode: z.enum(["AU", "NZ", "UK"]),
    name: z.string().trim().min(1).max(128),
  })
  .refine(({ countryCode }) => countryCode === "AU", {
    message:
      "Team Calendar currently supports Australian Xero Payroll files only.",
    path: ["countryCode"],
  });

type ActionError =
  | { code: "conflict"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function createOrganisationAction(input: {
  countryCode: string;
  name: string;
}): Promise<ActionResult<never>> {
  assertNoTenantTransaction("createOrganisationAction");
  const parsed = SetupOrganisationSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);

  if (
    !(orgId && user) ||
    (orgRole !== "org:admin" && orgRole !== "org:owner")
  ) {
    return notAuthorised();
  }

  // ensureOrganisationForClerk throws on DB failure, so redirect must be outside try/catch
  try {
    const prepared = await withTenantResult(
      orgId,
      async (db): Promise<ActionResult<void>> => {
        const payload: OrganisationSettingsInput = {
          clerkOrgId: orgId,
          countryCode: parsed.data.countryCode,
          name: parsed.data.name,
        };
        const tenant = await ensureOrganisationForClerk(payload, db);
        const personResult = await ensureCurrentUserPerson(
          tenant,
          {
            avatarUrl: user.imageUrl,
            clerkUserId: user.id,
            displayName:
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              user.emailAddresses[0]?.emailAddress ||
              user.id,
            email: user.emailAddresses[0]?.emailAddress,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          db
        );

        if (!personResult.ok) {
          if (personResult.error.code === "conflict") {
            return {
              error: {
                code: "conflict",
                message: personResult.error.message,
              },
              ok: false,
            };
          }
          return unknownError(personResult.error.message);
        }

        return { ok: true, value: undefined };
      }
    );
    if (!prepared.ok) {
      return prepared;
    }
  } catch {
    return unknownError("Failed to create organisation. Please try again.");
  }

  redirect("/");
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to set up this organisation.",
    },
    ok: false,
  };
}

function unknownError(message: string): ActionResult<never> {
  return { error: { code: "unknown_error", message }, ok: false };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid input.",
    },
    ok: false,
  };
}
