import type { Result, XeroConnectionState } from "@repo/core";
import { database } from "../client";

export type { XeroConnectionState } from "@repo/core";
export interface XeroConnectionStateResult {
  bindingGeneration: number | null;
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
  const scope = {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
  try {
    const tenant = await database.xeroTenant.findFirst({
      select: {
        active_slot: true,
        binding_generation: true,
        credential_owner: { select: { usability: true } },
        id: true,
        retired_at: true,
        xero_connection: {
          select: {
            disconnected_at: true,
            last_error_code: true,
            revoked_at: true,
            status: true,
          },
        },
      },
      where: scope,
    });
    if (!tenant) {
      return {
        ok: true,
        value: { bindingGeneration: null, state: "not_connected" },
      };
    }
    if (
      !Number.isInteger(tenant.binding_generation) ||
      tenant.binding_generation < 0
    ) {
      return { error: { code: "state_unavailable" }, ok: false };
    }
    const pending = await database.xeroCleanupAttempt.findFirst({
      select: { id: true },
      where: {
        ...scope,
        expected_binding_generation: tenant.binding_generation,
        request: {
          ...scope,
          binding_generation: tenant.binding_generation,
          xero_tenant_id: tenant.id,
        },
        state: {
          in: [
            "pending",
            "claimed",
            "dispatching",
            "blocked_authorisation",
            "unknown",
          ],
        },
      },
    });
    const connection = tenant.xero_connection;
    let state: XeroConnectionState;
    if (pending) {
      state = "disconnect_pending";
    } else if (
      tenant.active_slot !== 1 ||
      tenant.retired_at ||
      connection.disconnected_at ||
      connection.revoked_at
    ) {
      state = "not_connected";
    } else if (
      tenant.credential_owner?.usability === "reauthorisation_required" ||
      (!tenant.credential_owner &&
        connection.status === "stale" &&
        [
          "invalid_grant",
          "refresh_invalid_grant",
          "refresh_token_invalid",
          "reauthorisation_required",
        ].includes(connection.last_error_code ?? ""))
    ) {
      state = "reauthorisation_required";
    } else {
      state =
        connection.status === "active" || connection.status === "stale"
          ? "connected"
          : "not_connected";
    }
    return {
      ok: true,
      value: { bindingGeneration: tenant.binding_generation, state },
    };
  } catch {
    return { error: { code: "state_unavailable" }, ok: false };
  }
}
