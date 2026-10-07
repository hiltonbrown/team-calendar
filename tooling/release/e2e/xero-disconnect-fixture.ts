import { z } from "zod";

const disconnectFixtureSchema = z.strictObject({
  clerkOrgId: z.string().min(1),
  deleteAcknowledgement: z.literal("I_ACKNOWLEDGE_XERO_DEMO_CONNECTION_DELETE"),
  organisationId: z.uuid(),
  organisationName: z.string().trim().min(1),
  providerAppId: z.string().min(1),
  remoteConnectionId: z.uuid(),
  runId: z.uuid(),
  siblingOrganisationId: z.uuid(),
  siblingRemoteConnectionId: z.uuid(),
  xeroTenantId: z.uuid(),
});
export type DisconnectFixture = z.infer<typeof disconnectFixtureSchema>;

export function assertDisconnectDemoTarget(
  payload: unknown,
  tenantId: string
): void {
  const response = z
    .object({
      Organisations: z
        .array(
          z.object({
            CountryCode: z.literal("AU"),
            IsDemoCompany: z.literal(true),
            OrganisationID: z.uuid(),
          })
        )
        .length(1),
    })
    .parse(payload);
  if (response.Organisations[0]?.OrganisationID !== tenantId) {
    throw new Error(
      "Disconnect requires fresh demo proof for the exact tenant"
    );
  }
}

export function parseDisconnectFixture(
  value: unknown,
  scope: {
    runId: string;
    providerAppId: string;
    ownedClerkOrgIds: readonly string[];
    ownedOrganisationIds: readonly string[];
    primaryOrganisationId: string;
    foreignOrganisationId: string;
  }
): DisconnectFixture {
  const fixture = disconnectFixtureSchema.parse(value);
  if (
    fixture.runId !== scope.runId ||
    fixture.providerAppId !== scope.providerAppId
  ) {
    throw new Error(
      "Disconnect DELETE authority must match the current run and provider app"
    );
  }
  if (
    fixture.organisationId === scope.primaryOrganisationId ||
    fixture.organisationId === scope.foreignOrganisationId
  ) {
    throw new Error("Disconnect requires a dedicated disposable organisation");
  }
  if (
    !(
      scope.ownedClerkOrgIds.includes(fixture.clerkOrgId) &&
      scope.ownedOrganisationIds.includes(fixture.organisationId) &&
      scope.ownedOrganisationIds.includes(fixture.siblingOrganisationId)
    ) ||
    fixture.siblingOrganisationId === scope.foreignOrganisationId ||
    fixture.siblingOrganisationId === fixture.organisationId ||
    fixture.siblingRemoteConnectionId === fixture.remoteConnectionId
  ) {
    throw new Error(
      "Disconnect fixture and distinct sibling must be manifest-owned"
    );
  }
  return fixture;
}
