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
  input: XeroConnectionStateInput
): Promise<Result<XeroConnectionStateResult, XeroConnectionStateError>> {
  try {
    return await getXeroConnectionState(input);
  } catch {
    return { error: { code: "state_unavailable" }, ok: false };
  }
}
