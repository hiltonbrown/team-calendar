import type { Result, XeroConnectionState } from "@repo/core";
import { systemDatabase } from "../system-client";
import { assertTenantDb, type TenantDb } from "../tenant-db";

export type { XeroConnectionState } from "@repo/core";
export interface XeroConnectionStateResult {
  state: XeroConnectionState;
}
export interface XeroConnectionStateInput {
  accountId: string;
  organisationId: string;
}
export interface XeroConnectionStateError {
  code: "state_unavailable";
}
export async function getXeroConnectionState(
  input: XeroConnectionStateInput,
  db: TenantDb
): Promise<Result<XeroConnectionStateResult, XeroConnectionStateError>> {
  {
    assertTenantDb(db, input.accountId);
    const client = db;
    const connection = await client.xeroConnection.findFirst({
      select: { status: true, xero_authorisation_id: true },
      where: {
        account_id: input.accountId,
        organisation_id: input.organisationId,
        released_at: null,
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
  }
}
