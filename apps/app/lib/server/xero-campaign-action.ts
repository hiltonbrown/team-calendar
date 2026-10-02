import "server-only";

import type { Result } from "@repo/core";
import { withXeroCampaignAction } from "@repo/database/xero-campaign-access";
import {
  XeroCampaignDeniedError,
  XeroCampaignEventSchema,
} from "@repo/database/xero-campaign-contract";
import { headers } from "next/headers";
import { xeroActionTarget } from "@/lib/xero-action-target";

export async function readXeroCampaignActionHeader() {
  const encoded = (await headers()).get("x-teamcalendar-xero-campaign");
  if (encoded === null) {
    return;
  }
  if (encoded.length > 1024) {
    throw new XeroCampaignDeniedError();
  }
  try {
    return XeroCampaignEventSchema.parse(JSON.parse(encoded));
  } catch (cause) {
    const denied = new XeroCampaignDeniedError();
    denied.cause = cause;
    throw denied;
  }
}

export async function withAuthenticatedXeroCampaignAction<T, E>(
  functionId: string,
  scope: { clerkOrgId: string; organisationId: string; userId: string },
  target: unknown,
  operation: () => Promise<Result<T, E>>
): Promise<Result<T, E | { code: "not_authorised"; message: string }>> {
  try {
    return await withXeroCampaignAction(
      functionId,
      {
        ...scope,
        campaign: await readXeroCampaignActionHeader(),
        target: xeroActionTarget(target),
      },
      operation
    );
  } catch (error) {
    if (!(error instanceof XeroCampaignDeniedError)) {
      throw error;
    }
    return {
      error: {
        code: "not_authorised",
        message: "This action is temporarily unavailable. Try again later.",
      },
      ok: false,
    };
  }
}
