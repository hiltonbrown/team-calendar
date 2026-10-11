import type { Result, XeroConnectionState } from "@repo/core";
import type { Prisma } from "../../generated/client";
import { systemDatabase } from "../system-client";
import { tenantDatabase } from "../tenant-client";

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
  input: XeroConnectionStateInput,
  client: Pick<Prisma.TransactionClient, "xeroConnection"> = tenantDatabase(
    input.clerkOrgId
  )
): Promise<Result<XeroConnectionStateResult, XeroConnectionStateError>> {
  try {
    const connection = await client.xeroConnection.findFirst({
      select: { status: true, xero_authorisation_id: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    });
    const authorisation = connection?.xero_authorisation_id
      ? await systemDatabase.xeroAuthorisation.findUnique({
          select: { status: true },
          where: { id: connection.xero_authorisation_id },
        })
      : null;
    let state: XeroConnectionState = "connected";
    if (!connection || connection.status === "disconnected") {
      state = "not_connected";
    } else if (
      !authorisation ||
      connection.status === "reconnect_required" ||
      authorisation?.status === "reconnect_required"
    ) {
      state = "reauthorisation_required";
    }
    return { ok: true, value: { state } };
  } catch {
    return { error: { code: "state_unavailable" }, ok: false };
  }
}
