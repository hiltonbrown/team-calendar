import type { Result } from "@repo/core";
import { withXeroCampaignAction } from "@repo/database/xero-campaign-access";
import {
  XeroCampaignDeniedError,
  type XeroCampaignEvent,
  XeroCampaignEventSchema,
} from "@repo/database/xero-campaign-contract";

export async function withAvailabilityRequestAction<T, E>(
  request: Request,
  functionId: string,
  scope: { clerkOrgId: string; organisationId: string; userId: string },
  target: Record<string, unknown>,
  operation: () => Promise<Result<T, E>>
): Promise<Result<T, E | { code: "not_authorised"; message: string }>> {
  try {
    const encoded = request.headers.get("x-teamcalendar-xero-campaign");
    let campaign: XeroCampaignEvent | undefined;
    if (encoded !== null) {
      if (encoded.length > 1024) {
        throw new XeroCampaignDeniedError();
      }
      try {
        campaign = XeroCampaignEventSchema.parse(JSON.parse(encoded));
      } catch (cause) {
        const denied = new XeroCampaignDeniedError();
        denied.cause = cause;
        throw denied;
      }
    }
    return await withXeroCampaignAction(
      functionId,
      {
        ...scope,
        campaign,
        target: Object.fromEntries(
          Object.entries(target).filter(([, value]) => value !== undefined)
        ),
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
