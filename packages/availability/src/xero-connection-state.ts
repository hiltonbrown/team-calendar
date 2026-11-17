import { assertTenantDb, type TenantDb } from "@repo/database";
import "server-only";
import type { Result } from "@repo/core";
import {
  getXeroConnectionState,
  type XeroConnectionStateError,
  type XeroConnectionStateInput,
  type XeroConnectionStateResult,
} from "@repo/database/queries/xero-connection-state";

export type { XeroConnectionStateInput } from "@repo/database/queries/xero-connection-state";

export async function getXeroConnectionStateForScope(
  input: XeroConnectionStateInput,
  db: TenantDb
): Promise<Result<XeroConnectionStateResult, XeroConnectionStateError>> {
  assertTenantDb(db, input.accountId);
  return await getXeroConnectionState(input, db);
}
