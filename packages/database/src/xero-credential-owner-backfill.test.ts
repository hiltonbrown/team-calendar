import { describe, expect, it } from "vitest";
import { planXeroCredentialOwnerBackfill } from "./xero-credential-owner-backfill";

function binding(id = "tenant-1", ownerId: string | null = null) {
  return {
    active_slot: 1,
    id,
    provider_app_id: "app",
    xero_credential_owner_id: ownerId,
  };
}

describe("legacy credential owner backfill", () => {
  it("attaches an expired but verified singleton without judging token expiry", () => {
    const result = planXeroCredentialOwnerBackfill(
      [binding()],
      [{ tenantId: "tenant-1", xeroUserId: "user" }],
      "app"
    );
    expect(result.attachments).toEqual([
      { ownerId: null, tenantId: "tenant-1", xeroUserId: "user" },
    ]);
  });
  it("leaves unverifiable bindings unowned", () => {
    const result = planXeroCredentialOwnerBackfill(
      [binding()],
      [{ tenantId: "tenant-1", xeroUserId: null }],
      "app"
    );
    expect(result.attachments).toEqual([]);
    expect(result.unverifiableTenantIds).toEqual(["tenant-1"]);
  });
  it("reports shared identities without choosing a canonical token", () => {
    const result = planXeroCredentialOwnerBackfill(
      [binding(), binding("tenant-2")],
      [
        { tenantId: "tenant-1", xeroUserId: "user" },
        { tenantId: "tenant-2", xeroUserId: "user" },
      ],
      "app"
    );
    expect(result.attachments).toEqual([]);
    expect(result.groups).toEqual([
      { tenantIds: ["tenant-1", "tenant-2"], xeroUserId: "user" },
    ]);
  });
  it("does nothing on an already attached rerun", () => {
    expect(
      planXeroCredentialOwnerBackfill(
        [binding("tenant-1", "owner")],
        [{ tenantId: "tenant-1", xeroUserId: "user" }],
        "app"
      ).attachments
    ).toEqual([]);
  });
  it("reuses an existing owner and ignores retired or other-app bindings", () => {
    const result = planXeroCredentialOwnerBackfill(
      [
        binding(),
        { ...binding("retired"), active_slot: null },
        { ...binding("other"), provider_app_id: "other-app" },
      ],
      [{ tenantId: "tenant-1", xeroUserId: "user" }],
      "app",
      [{ id: "owner", provider_app_id: "app", xero_user_id: "user" }]
    );
    expect(result.attachments).toEqual([
      { ownerId: "owner", tenantId: "tenant-1", xeroUserId: "user" },
    ]);
  });
  it("rejects duplicate identity evidence instead of choosing by arrival order", () => {
    expect(() =>
      planXeroCredentialOwnerBackfill(
        [binding()],
        [
          { tenantId: "tenant-1", xeroUserId: "user" },
          { tenantId: "tenant-1", xeroUserId: "other" },
        ],
        "app"
      )
    ).toThrow("Duplicate");
  });
});
