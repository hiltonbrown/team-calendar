import { describe, expect, it } from "vitest";
import {
  assertDisconnectDemoTarget,
  parseDisconnectFixture,
} from "./xero-disconnect-fixture.js";

const primary = "11111111-1111-4111-8111-111111111111";
const foreign = "22222222-2222-4222-8222-222222222222";
const disposable = "33333333-3333-4333-8333-333333333333";
const fixture = {
  clerkOrgId: "owned-account",
  deleteAcknowledgement: "I_ACKNOWLEDGE_XERO_DEMO_CONNECTION_DELETE",
  organisationId: disposable,
  organisationName: "Disposable Xero disconnect fixture",
  providerAppId: "current-provider-app",
  remoteConnectionId: "44444444-4444-4444-8444-444444444444",
  runId: "88888888-8888-4888-8888-888888888888",
  siblingOrganisationId: primary,
  siblingRemoteConnectionId: "55555555-5555-4555-8555-555555555555",
  xeroTenantId: "66666666-6666-4666-8666-666666666666",
};
const scope = {
  foreignOrganisationId: foreign,
  ownedClerkOrgIds: ["owned-account"],
  ownedOrganisationIds: [primary, foreign, disposable],
  primaryOrganisationId: primary,
  providerAppId: fixture.providerAppId,
  runId: fixture.runId,
};

describe("disposable disconnect fixture selection", () => {
  it("selects an explicitly owned disposable organisation and sibling", () => {
    expect(parseDisconnectFixture(fixture, scope)).toEqual(fixture);
  });
  it.each([primary, foreign])(
    "refuses a shared journey organisation %s",
    (organisationId) => {
      expect(() =>
        parseDisconnectFixture({ ...fixture, organisationId }, scope)
      ).toThrow("dedicated disposable");
    }
  );
  it("refuses unowned account or organisation and a foreign sibling", () => {
    for (const candidate of [
      { ...fixture, clerkOrgId: "unowned-account" },
      { ...fixture, organisationId: "77777777-7777-4777-8777-777777777777" },
      { ...fixture, siblingOrganisationId: foreign },
      { ...fixture, siblingOrganisationId: disposable },
      { ...fixture, siblingRemoteConnectionId: fixture.remoteConnectionId },
    ]) {
      expect(() => parseDisconnectFixture(candidate, scope)).toThrow();
    }
  });
  it("requires explicit complete fixture prerequisites", () => {
    expect(() => parseDisconnectFixture(null, scope)).toThrow();
    expect(() =>
      parseDisconnectFixture({ ...fixture, remoteConnectionId: "" }, scope)
    ).toThrow();
  });
});

it("refuses DELETE without explicit run-bound provider authority", () => {
  const { deleteAcknowledgement: _, ...withoutAuthority } = fixture;
  expect(() => parseDisconnectFixture(withoutAuthority, scope)).toThrow();
  for (const candidate of [
    { ...fixture, deleteAcknowledgement: "ALLOW_LIVE_DATABASE_TESTS" },
    { ...fixture, runId: primary },
    { ...fixture, providerAppId: "another-provider-app" },
  ]) {
    expect(() => parseDisconnectFixture(candidate, scope)).toThrow();
  }
});

describe("fresh provider demo provenance", () => {
  const demo = () => ({
    CountryCode: "AU",
    IsDemoCompany: true,
    OrganisationID: fixture.xeroTenantId,
  });
  it("accepts an exact AU demo company from the provider Organisation response", () => {
    expect(() =>
      assertDisconnectDemoTarget(
        { Organisations: [demo()] },
        fixture.xeroTenantId
      )
    ).not.toThrow();
  });
  it("refuses production, absent demo proof, a different company and a different country", () => {
    for (const row of [
      { ...demo(), IsDemoCompany: false },
      { CountryCode: "AU", OrganisationID: fixture.xeroTenantId },
      { ...demo(), OrganisationID: primary },
      { ...demo(), CountryCode: "NZ" },
    ]) {
      expect(() =>
        assertDisconnectDemoTarget(
          { Organisations: [row] },
          fixture.xeroTenantId
        )
      ).toThrow();
    }
    expect(() =>
      assertDisconnectDemoTarget({ Organisations: [] }, fixture.xeroTenantId)
    ).toThrow();
  });
});
