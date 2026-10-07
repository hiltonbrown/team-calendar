import type { Result, XeroConnectionState } from "@repo/core";
import { database } from "../client";

export type { XeroConnectionState } from "@repo/core";
export interface XeroConnectionStateResult {
  state: XeroConnectionState;
}
export interface XeroConnectionStateInput {
  clerkOrgId: string;
  organisationId: string;
}
export interface XeroConnectionStateError {
  code: "state_unavailable";
}
export async function getXeroConnectionState(
  input: XeroConnectionStateInput
): Promise<Result<XeroConnectionStateResult, XeroConnectionStateError>> {
  try {
    const connection = await database.xeroConnection.findFirst({
      select: { authorisation: { select: { status: true } }, status: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    });
    let state: XeroConnectionState = "connected";
    if (!connection || connection.status === "disconnected") {
      state = "not_connected";
    } else if (
      !connection.authorisation ||
      connection.status === "reconnect_required" ||
      connection.authorisation?.status === "reconnect_required"
    ) {
      state = "reauthorisation_required";
    }
    return { ok: true, value: { state } };
  } catch {
    return { error: { code: "state_unavailable" }, ok: false };
  }
}
