import { describe, expect, it } from "vitest";
import {
  captureXeroCredentialIdentitySnapshot,
  matchesXeroCredentialIdentitySnapshot,
  xeroCredentialIdentityArtifactSchema,
} from "./xero-credential-identity-artifact";

const binding = {
  binding_generation: 4,
  clerk_org_id: "clerk-org",
  id: "11111111-1111-4111-8111-111111111111",
  organisation_id: "22222222-2222-4222-8222-222222222222",
  provider_app_id: "provider-app",
  xero_connection: {
    access_token_auth_tag: "access-tag",
    access_token_encrypted: "synthetic-access-ciphertext",
    access_token_iv: "access-iv",
    expires_at: new Date("2026-09-26T12:00:00Z"),
    refresh_token_auth_tag: "refresh-tag",
    refresh_token_encrypted: "synthetic-refresh-ciphertext",
    refresh_token_iv: "refresh-iv",
    token_key_version: 1,
  },
  xero_connection_id: "33333333-3333-4333-8333-333333333333",
};

describe("verified credential identity artefact", () => {
  it("records proof scope and a digest without any credential envelope", () => {
    const snapshot = captureXeroCredentialIdentitySnapshot(
      binding,
      "verified-xero-user"
    );
    const artifact = xeroCredentialIdentityArtifactSchema.parse({
      entries: [snapshot],
      providerAppId: binding.provider_app_id,
      version: 1,
    });
    expect(matchesXeroCredentialIdentitySnapshot(snapshot, binding)).toBe(true);
    const output = JSON.stringify(artifact);
    for (const value of Object.values(binding.xero_connection)) {
      if (typeof value === "string") {
        expect(output).not.toContain(value);
      }
    }
    expect(snapshot).toMatchObject({
      bindingGeneration: 4,
      clerkOrgId: binding.clerk_org_id,
      connectionId: binding.xero_connection_id,
      organisationId: binding.organisation_id,
    });
  });
  it.each([
    "access_token_encrypted",
    "access_token_iv",
    "access_token_auth_tag",
    "refresh_token_encrypted",
    "refresh_token_iv",
    "refresh_token_auth_tag",
  ] as const)("rejects changed %s", (field) => {
    const snapshot = captureXeroCredentialIdentitySnapshot(
      binding,
      "verified-xero-user"
    );
    expect(
      matchesXeroCredentialIdentitySnapshot(snapshot, {
        ...binding,
        xero_connection: { ...binding.xero_connection, [field]: "changed" },
      })
    ).toBe(false);
  });
  it.each([
    { binding_generation: 5 },
    { clerk_org_id: "foreign" },
    { organisation_id: "44444444-4444-4444-8444-444444444444" },
    { provider_app_id: "foreign-app" },
    { xero_connection_id: "55555555-5555-4555-8555-555555555555" },
  ])("rejects changed binding identity %j", (change) => {
    expect(
      matchesXeroCredentialIdentitySnapshot(
        captureXeroCredentialIdentitySnapshot(binding, "verified-user"),
        { ...binding, ...change }
      )
    ).toBe(false);
  });
  it("includes encryption key version and token expiry in the snapshot", () => {
    const snapshot = captureXeroCredentialIdentitySnapshot(
      binding,
      "verified-user"
    );
    for (const change of [
      { token_key_version: 2 },
      { expires_at: new Date("2026-09-26T13:00:00Z") },
    ]) {
      expect(
        matchesXeroCredentialIdentitySnapshot(snapshot, {
          ...binding,
          xero_connection: { ...binding.xero_connection, ...change },
        })
      ).toBe(false);
    }
  });
  it("rejects unversioned, duplicate and cross-app identity plans", () => {
    const snapshot = captureXeroCredentialIdentitySnapshot(
      binding,
      "verified-user"
    );
    for (const artifact of [
      [{ tenantId: binding.id, xeroUserId: "verified-user" }],
      { entries: [snapshot], providerAppId: "foreign-app", version: 1 },
      {
        entries: [snapshot, snapshot],
        providerAppId: binding.provider_app_id,
        version: 1,
      },
      {
        entries: [snapshot],
        providerAppId: binding.provider_app_id,
        version: 2,
      },
    ]) {
      expect(
        xeroCredentialIdentityArtifactSchema.safeParse(artifact).success
      ).toBe(false);
    }
  });
});
