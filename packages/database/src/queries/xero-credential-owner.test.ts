import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureXeroCredentialIdentitySnapshot } from "../xero-credential-identity-artifact";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  binding: vi.fn(),
  connection: vi.fn(),
  count: vi.fn(),
  execute: vi.fn(),
  lock: vi.fn(),
  mirror: vi.fn(),
  owner: vi.fn(),
  transaction: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("../client", () => ({ database: { $transaction: mocks.transaction } }));

import { applyVerifiedXeroCredentialOwnerAttachment } from "./xero-credential-owner";

const binding = {
  active_slot: 1,
  binding_generation: 1,
  clerk_org_id: "clerk",
  id: "11111111-1111-4111-8111-111111111111",
  organisation_id: "22222222-2222-4222-8222-222222222222",
  provider_app_id: "app",
  retired_at: null,
  xero_connection_id: "33333333-3333-4333-8333-333333333333",
  xero_credential_owner_id: null,
};
const connection = {
  access_token_auth_tag: "access-tag",
  access_token_encrypted: "verified-ciphertext",
  access_token_iv: "access-iv",
  clerk_org_id: binding.clerk_org_id,
  disconnected_at: null,
  expires_at: new Date("2026-09-26T12:00:00Z"),
  id: binding.xero_connection_id,
  last_refreshed_at: null,
  organisation_id: binding.organisation_id,
  refresh_token_auth_tag: "refresh-tag",
  refresh_token_encrypted: "refresh-ciphertext",
  refresh_token_iv: "refresh-iv",
  revoked_at: null,
  status: "active",
  token_key_version: 1,
};
const identity = captureXeroCredentialIdentitySnapshot(
  { ...binding, xero_connection: connection },
  "verified-user"
);
const input = { identity, identityGroup: [identity], providerAppId: "app" };
const tx = {
  $executeRaw: mocks.execute,
  $queryRaw: mocks.lock,
  xeroConnection: { findFirst: mocks.connection, update: mocks.mirror },
  xeroCredentialOwner: { findUnique: mocks.owner, upsert: mocks.upsert },
  xeroTenant: {
    count: mocks.count,
    findFirst: mocks.binding,
    update: mocks.attach,
  },
};
const ownerId = "44444444-4444-4444-8444-444444444444";

describe("verified legacy attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.binding.mockResolvedValue(binding);
    mocks.connection.mockResolvedValue(connection);
    mocks.count.mockResolvedValue(1);
    mocks.owner.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({
      ...connection,
      id: ownerId,
      last_rotated_at: null,
      token_expires_at: connection.expires_at,
    });
    mocks.transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        await callback(tx)
    );
  });
  it("attaches a verified unchanged expired envelope under ordered locks and both scopes", async () => {
    expect(
      await applyVerifiedXeroCredentialOwnerAttachment(input, {
        createOwnerId: () => ownerId,
      })
    ).toEqual({ ok: true, value: { attached: true } });
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.upsert.mock.calls[0]?.[0].create).toMatchObject({
      access_token_encrypted: "verified-ciphertext",
      identity_evidence: "legacy_access_token_jwt",
      usability: "usable",
      xero_user_id: "verified-user",
    });
    expect(mocks.attach.mock.calls[0]?.[0].where).toMatchObject({
      binding_generation: 1,
      clerk_org_id: "clerk",
      organisation_id: binding.organisation_id,
      xero_credential_owner_id: null,
    });
    const locks = mocks.lock.mock.calls.map((call) => call[1]);
    expect(locks).toEqual([
      "xero-owner:app:verified-user",
      `xero-owner:${ownerId}`,
      `xero-binding:${binding.id}`,
      connection.id,
    ]);
    expect(mocks.mirror.mock.calls[0]?.[0].where).toEqual({
      clerk_org_id: "clerk",
      id: connection.id,
      organisation_id: binding.organisation_id,
    });
  });
  it.each([
    { binding_generation: 2 },
    { active_slot: null },
    { retired_at: new Date() },
    { clerk_org_id: "foreign" },
    { organisation_id: "55555555-5555-4555-8555-555555555555" },
    { xero_connection_id: "66666666-6666-4666-8666-666666666666" },
  ])("rejects a changed binding before owner creation: %j", async (change) => {
    mocks.binding.mockResolvedValue({ ...binding, ...change });
    expect(
      await applyVerifiedXeroCredentialOwnerAttachment(input)
    ).toMatchObject({ error: { code: "conflict" }, ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it.each([
    { access_token_encrypted: "new-user-ciphertext" },
    { refresh_token_encrypted: "rotated-refresh" },
    { token_key_version: 2 },
    { disconnected_at: new Date() },
    { status: "disconnected" },
    { revoked_at: new Date() },
  ])(
    "rejects reauthorised or unavailable credential snapshots before writes: %j",
    async (change) => {
      mocks.connection.mockResolvedValue({ ...connection, ...change });
      expect(
        await applyVerifiedXeroCredentialOwnerAttachment(input)
      ).toMatchObject({ error: { code: "conflict" }, ok: false });
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.attach).not.toHaveBeenCalled();
      expect(mocks.mirror).not.toHaveBeenCalled();
    }
  );
  it("rejects unknown identity and a foreign configured provider without SQL", async () => {
    for (const altered of [
      { ...input, providerAppId: "foreign" },
      { ...input, identity: { ...identity, xeroUserId: null } },
    ]) {
      expect(
        await applyVerifiedXeroCredentialOwnerAttachment(altered)
      ).toMatchObject({ ok: false });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("refuses a newly shared identity group before creating or attaching an owner", async () => {
    mocks.count.mockResolvedValue(2);
    expect(
      await applyVerifiedXeroCredentialOwnerAttachment(input)
    ).toMatchObject({ error: { code: "conflict" }, ok: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.attach).not.toHaveBeenCalled();
  });
});
